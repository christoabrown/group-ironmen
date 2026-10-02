//! What the handlers that serve the hub's history share. The hub API key
//! stays on the server; responses are cached (see `cache.rs`) so the number of
//! hub requests does not grow with the number of viewers.
use crate::config::Config;
use crate::hub::client::{HubClient, HubError, Priority};
use crate::hub::HubContext;
use actix_web::http::StatusCode;
use actix_web::{HttpResponse, ResponseError};
use serde::Deserialize;
use serde_json::Value;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

/// Why a history handler answers without data. Handlers return it with `?`;
/// the response has the `error` the site tells apart (`hubErrorMessage` in
/// site/src/data/hub-format.js).
#[derive(Debug)]
pub(crate) enum HistoryError {
    /// Hub history is switched off on this server.
    Disabled,
    /// The request is wrong, with what to tell whoever sent it.
    BadRequest(String),
    Hub(HubError),
}

impl From<HubError> for HistoryError {
    fn from(err: HubError) -> Self {
        HistoryError::Hub(err)
    }
}

impl std::fmt::Display for HistoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HistoryError::Disabled => write!(f, "hub history is not enabled"),
            HistoryError::BadRequest(message) => write!(f, "{}", message),
            HistoryError::Hub(err) => write!(f, "{}", err),
        }
    }
}

impl ResponseError for HistoryError {
    fn status_code(&self) -> StatusCode {
        match self {
            HistoryError::Disabled | HistoryError::Hub(HubError::NotFound) => StatusCode::NOT_FOUND,
            HistoryError::BadRequest(_) => StatusCode::BAD_REQUEST,
            HistoryError::Hub(HubError::RateLimited(_)) => StatusCode::SERVICE_UNAVAILABLE,
            HistoryError::Hub(_) => StatusCode::BAD_GATEWAY,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let mut response = HttpResponse::build(self.status_code());
        let (error, message) = match self {
            HistoryError::BadRequest(message) => return response.body(message.clone()),
            HistoryError::Disabled => {
                ("hub_disabled", "Hub history is not enabled on this server.")
            }
            HistoryError::Hub(HubError::NotFound) => {
                ("not_available", "This data is not available from the hub.")
            }
            HistoryError::Hub(HubError::RateLimited(after)) => {
                response.insert_header(("Retry-After", after.as_secs().max(1).to_string()));
                ("rate_limited", "The hub is busy, try again shortly.")
            }
            HistoryError::Hub(HubError::Invalid(message)) => {
                log::warn!("The hub rejected a request: {}", message);
                ("hub_rejected", "The hub rejected the request.")
            }
            HistoryError::Hub(HubError::Unauthorized) => {
                log::error!("The hub rejected the API key; check HUB_API_KEY");
                (
                    "hub_unauthorized",
                    "The hub rejected this server's API key.",
                )
            }
            HistoryError::Hub(HubError::Other(message)) => {
                log::warn!("Hub request failed: {}", message);
                ("hub_unavailable", "The hub could not be reached.")
            }
        };
        response.json(serde_json::json!({ "error": error, "message": message }))
    }
}

pub(crate) fn history_enabled(config: &Config) -> Result<(), HistoryError> {
    if config.hub_history_enabled() {
        Ok(())
    } else {
        Err(HistoryError::Disabled)
    }
}

/// How far back history is asked for. The site names a period in lower case,
/// and the skill graphs with a capital.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Period {
    #[serde(alias = "Day")]
    Day,
    #[serde(alias = "Week")]
    Week,
    #[serde(alias = "Month")]
    Month,
    #[serde(alias = "Year")]
    Year,
}

impl Period {
    /// The hub's name for the period, which the cache keys use too.
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Period::Day => "day",
            Period::Week => "week",
            Period::Month => "month",
            Period::Year => "year",
        }
    }

    pub(crate) fn days(self) -> i64 {
        match self {
            Period::Day => 1,
            Period::Week => 7,
            Period::Month => 30,
            Period::Year => 365,
        }
    }
}

impl std::fmt::Display for Period {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// The hub's answer to a request, as it goes into the cache.
pub(crate) async fn fetch_json(
    client: &Arc<HubClient>,
    path: &str,
    query: &[(&str, String)],
) -> Result<Value, HubError> {
    let (data, _) = client
        .get_data::<Value>(path, query, Priority::Interactive)
        .await?;
    Ok(data)
}

/// Parses a cached hub response into its type.
pub(crate) fn parse<T: serde::de::DeserializeOwned>(value: &Value) -> Result<T, HubError> {
    serde_json::from_value(value.clone()).map_err(|err| HubError::Other(err.to_string()))
}

/// The hub's answer to a request, from the cache under `key` when that has
/// one younger than `ttl`. The key holds nothing that changes with the time
/// of asking: with the start of a period in it, it would be a new one every
/// time.
pub(crate) async fn cached<T: serde::de::DeserializeOwned>(
    context: &HubContext,
    key: &str,
    ttl: Duration,
    path: &str,
    query: &[(&str, String)],
) -> Result<T, HubError> {
    let value = context
        .cache
        .get_or_fetch(key, ttl, || fetch_json(&context.client, path, query))
        .await?;
    parse(&value)
}

/// The hub accounts to request at once, per the key's kind.
pub(crate) fn bulk_accounts(context: &HubContext) -> usize {
    context
        .capabilities
        .read()
        .map(|capabilities| capabilities.bulk_accounts)
        .unwrap_or(crate::hub::USER_KEY_BULK_ACCOUNTS)
        .max(1)
}

/// A bulk request for the accounts of `chunk`, made by `fetch`. One unreadable
/// account fails the whole request with a 404, so after one the accounts are
/// asked for one by one and the unreadable ones are left out.
pub(crate) async fn bulk_or_each<T, F, Fut>(chunk: &[String], fetch: F) -> Result<Vec<T>, HubError>
where
    F: Fn(Vec<String>) -> Fut,
    Fut: Future<Output = Result<T, HubError>>,
{
    match fetch(chunk.to_vec()).await {
        Ok(answer) => Ok(vec![answer]),
        // The one account asked for is the unreadable one.
        Err(HubError::NotFound) if chunk.len() == 1 => Ok(Vec::new()),
        Err(HubError::NotFound) => {
            let mut answers = Vec::new();
            for id in chunk {
                match fetch(vec![id.clone()]).await {
                    Ok(answer) => answers.push(answer),
                    Err(HubError::NotFound) => {}
                    Err(err) => return Err(err),
                }
            }
            Ok(answers)
        }
        Err(err) => Err(err),
    }
}

/// A comma-separated list parameter.
pub(crate) fn list_param(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn list_params_are_trimmed() {
        assert_eq!(list_param(Some(" a, b ,,c")), vec!["a", "b", "c"]);
        assert!(list_param(None).is_empty());
    }

    #[test]
    fn a_period_is_read_in_lower_case_and_with_a_capital() {
        let read = |text: &str| serde_json::from_value::<Period>(Value::String(text.to_owned()));
        assert_eq!(read("week").unwrap(), Period::Week);
        assert_eq!(read("Year").unwrap(), Period::Year);
        assert!(read("decade").is_err());
        assert_eq!(Period::Month.to_string(), "month");
    }

    #[test]
    fn an_error_answers_with_the_status_the_site_expects() {
        let status = |err: HistoryError| err.error_response().status();
        assert_eq!(status(HistoryError::Disabled), StatusCode::NOT_FOUND);
        assert_eq!(
            status(HistoryError::BadRequest("no".to_owned())),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(status(HubError::NotFound.into()), StatusCode::NOT_FOUND);
        assert_eq!(
            status(HubError::Other("down".to_owned()).into()),
            StatusCode::BAD_GATEWAY
        );

        let busy = HistoryError::from(HubError::RateLimited(Duration::from_secs(7)));
        let response = busy.error_response();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(response.headers().get("Retry-After").unwrap(), "7");
    }

    fn ids(names: &[&str]) -> Vec<String> {
        names.iter().map(|name| name.to_string()).collect()
    }

    /// Asks for `chunk` from a hub that can't read the account "x", and gives
    /// the answers along with every request made.
    async fn ask(chunk: &[&str]) -> (Result<Vec<String>, HubError>, Vec<String>) {
        let asked = Mutex::new(Vec::new());
        let answers = bulk_or_each(&ids(chunk), |ids| {
            asked.lock().unwrap().push(ids.join(","));
            async move {
                if ids.iter().any(|id| id == "x") {
                    Err(HubError::NotFound)
                } else {
                    Ok(ids.join("+"))
                }
            }
        })
        .await;
        (answers, asked.into_inner().unwrap())
    }

    #[tokio::test]
    async fn a_readable_chunk_is_one_request() {
        let (answers, asked) = ask(&["a", "b"]).await;
        assert_eq!(answers.unwrap(), ["a+b"]);
        assert_eq!(asked, ["a,b"]);
    }

    #[tokio::test]
    async fn a_chunk_with_an_unreadable_account_is_asked_for_one_by_one() {
        let (answers, asked) = ask(&["a", "x", "b"]).await;
        assert_eq!(answers.unwrap(), ["a", "b"]);
        assert_eq!(asked, ["a,x,b", "a", "x", "b"]);
    }

    #[tokio::test]
    async fn one_unreadable_account_is_not_asked_for_twice() {
        let (answers, asked) = ask(&["x"]).await;
        assert!(answers.unwrap().is_empty());
        assert_eq!(asked, ["x"]);
    }

    #[tokio::test]
    async fn another_error_ends_the_one_by_one() {
        let asked = Mutex::new(0);
        let answers: Result<Vec<()>, HubError> = bulk_or_each(&ids(&["a", "b", "c"]), |ids| {
            *asked.lock().unwrap() += 1;
            async move {
                Err(if ids.len() > 1 {
                    HubError::NotFound
                } else {
                    HubError::Other("down".to_owned())
                })
            }
        })
        .await;
        assert!(matches!(answers, Err(HubError::Other(_))));
        assert_eq!(asked.into_inner().unwrap(), 2);
    }
}
