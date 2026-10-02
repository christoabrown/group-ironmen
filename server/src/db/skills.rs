//! Skill history: the samples kept per period, behind the skill graphs.
use crate::error::ApiError;
use crate::models::{AggregateSkillData, GroupSkillData, MemberSkillData};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Transaction};
use std::collections::HashMap;

pub(crate) async fn delete_skills_data_for_member(
    transaction: &Transaction<'_>,
    period: AggregatePeriod,
    member_id: i64,
) -> Result<(), ApiError> {
    let s = format!(
        r#"
DELETE FROM groupironman.skills_{} WHERE member_id=$1
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        }
    );
    let delete_skills_data_stmt = transaction.prepare_cached(&s).await?;
    transaction
        .execute(&delete_skills_data_stmt, &[&member_id])
        .await?;

    Ok(())
}

pub(crate) enum AggregatePeriod {
    Day,
    Month,
    Year,
}

async fn aggregate_skills_for_period(
    transaction: &Transaction<'_>,
    period: AggregatePeriod,
    last_aggregation: &DateTime<Utc>,
) -> Result<(), ApiError> {
    let s = format!(
        r#"
INSERT INTO groupironman.skills_{} (member_id, time, skills)
SELECT member_id, date_trunc('{}', skills_last_update), skills FROM groupironman.members
WHERE skills_last_update IS NOT NULL AND skills IS NOT NULL AND skills_last_update >= $1
ON CONFLICT (member_id, time)
DO UPDATE SET skills=excluded.skills;
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        },
        match period {
            AggregatePeriod::Day => "hour",
            AggregatePeriod::Month => "day",
            AggregatePeriod::Year => "month",
        }
    );
    let aggregate_stmt = transaction.prepare_cached(&s).await?;
    transaction
        .execute(&aggregate_stmt, &[&last_aggregation])
        .await?;

    Ok(())
}

async fn apply_skills_retention_for_period(
    transaction: &Transaction<'_>,
    period: AggregatePeriod,
    last_aggregation: &DateTime<Utc>,
) -> Result<(), ApiError> {
    let s = format!(
        r#"
DELETE FROM groupironman.skills_{0}
WHERE time < ($1::timestamptz - interval '{1}') AND (member_id, time) NOT IN (
  SELECT member_id, max(time) FROM groupironman.skills_{0} WHERE time < ($1::timestamptz - interval '{1}') GROUP BY member_id
)
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        },
        match period {
            AggregatePeriod::Day => "1 day",
            AggregatePeriod::Month => "1 month",
            AggregatePeriod::Year => "1 year",
        }
    );
    let delete_old_rows_stmt = transaction.prepare_cached(&s).await?;
    transaction
        .execute(&delete_old_rows_stmt, &[&last_aggregation])
        .await?;

    Ok(())
}

pub(crate) async fn get_last_skills_aggregation(
    client: &Client,
) -> Result<DateTime<Utc>, ApiError> {
    let last_aggregation_stmt = client
        .prepare_cached(
            r#"
SELECT last_aggregation FROM groupironman.aggregation_info WHERE type='skills'"#,
        )
        .await?;
    let last_aggregation: DateTime<Utc> = client
        .query_one(&last_aggregation_stmt, &[])
        .await?
        .try_get(0)?;

    Ok(last_aggregation)
}

pub(crate) async fn aggregate_skills(client: &mut Client) -> Result<(), ApiError> {
    let last_aggregation = get_last_skills_aggregation(client).await?;

    let transaction = client.transaction().await?;
    let update_last_aggregation_stmt = transaction
        .prepare_cached(
            r#"
UPDATE groupironman.aggregation_info SET last_aggregation=NOW() WHERE type='skills'"#,
        )
        .await?;
    transaction
        .execute(&update_last_aggregation_stmt, &[])
        .await?;

    aggregate_skills_for_period(&transaction, AggregatePeriod::Day, &last_aggregation).await?;
    aggregate_skills_for_period(&transaction, AggregatePeriod::Month, &last_aggregation).await?;
    aggregate_skills_for_period(&transaction, AggregatePeriod::Year, &last_aggregation).await?;
    transaction.commit().await?;

    Ok(())
}

pub(crate) async fn apply_skills_retention(client: &mut Client) -> Result<(), ApiError> {
    let last_aggregation = get_last_skills_aggregation(client).await?;

    let transaction = client.transaction().await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Day, &last_aggregation)
        .await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Month, &last_aggregation)
        .await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Year, &last_aggregation)
        .await?;
    transaction.commit().await?;

    Ok(())
}

pub(crate) async fn get_skills_for_period(
    client: &Client,
    group_id: i64,
    period: AggregatePeriod,
) -> Result<GroupSkillData, ApiError> {
    let s = format!(
        r#"
SELECT member_name, time, s.skills
FROM groupironman.skills_{} s
INNER JOIN groupironman.members m ON m.member_id=s.member_id
WHERE m.group_id=$1 AND NOT m.hidden
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        }
    );
    let get_skills_stmt = client.prepare_cached(&s).await?;
    let rows = client
        .query(&get_skills_stmt, &[&group_id])
        .await
        .map_err(ApiError::GetSkillsDataError)?;

    let mut member_data = HashMap::new();
    for row in rows {
        let member_name: String = row.try_get("member_name")?;
        let skill_data = AggregateSkillData {
            time: row.try_get("time")?,
            data: row.try_get("skills")?,
        };

        if !member_data.contains_key(&member_name) {
            member_data.insert(
                member_name.clone(),
                MemberSkillData {
                    name: member_name,
                    skill_data: vec![skill_data],
                },
            );
        } else if let Some(member_skill_data) = member_data.get_mut(&member_name) {
            member_skill_data.skill_data.push(skill_data);
        }
    }

    Ok(member_data.into_values().collect())
}
