DROP SCHEMA IF EXISTS groupironman CASCADE;
CREATE SCHEMA groupironman;

CREATE TABLE groupironman.groups(
       group_id BIGSERIAL UNIQUE,
       group_name TEXT NOT NULL,
       group_token_hash CHAR(64) NOT NULL,
       PRIMARY KEY (group_name, group_token_hash)
);

CREATE TABLE groupironman.members(
       group_id BIGSERIAL REFERENCES groupironman.groups(group_id),
       member_name TEXT,

       stats_last_update TIMESTAMPTZ,
       stats TEXT NOT NULL default '{}'::TEXT,

       coordinates_last_update TIMESTAMPTZ,
       coordinates TEXT NOT NULL default '{}'::TEXT,

       skills_last_update TIMESTAMPTZ,
       skills TEXT NOT NULL default '{}'::TEXT,

       quests_last_update TIMESTAMPTZ,
       quests TEXT NOT NULL default '{}'::TEXT,

       inventory_last_update TIMESTAMPTZ,
       inventory TEXT NOT NULL default '[]'::TEXT,

       equipment_last_update TIMESTAMPTZ,
       equipment TEXT NOT NULL default '[]'::TEXT,

       bank_last_update TIMESTAMPTZ,
       bank TEXT NOT NULL default '[]'::TEXT,

       PRIMARY KEY (group_id, member_name)
);
