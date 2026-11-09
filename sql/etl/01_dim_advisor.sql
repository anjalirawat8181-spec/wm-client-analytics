CREATE TEMP TABLE _adv ON COMMIT DROP AS
WITH x AS (
    SELECT s.advisor_id, s.advisor_name, s.branch, s.team, s.join_date,
           to_jsonb(s) AS raw,
           row_number() OVER (PARTITION BY s.advisor_id ORDER BY s.ctid) AS rn
    FROM staging.advisors s
)
SELECT x.*,
       CASE WHEN advisor_id IS NULL OR advisor_name IS NULL OR branch IS NULL
                 OR team IS NULL OR join_date IS NULL THEN 'dim_advisor_not_null'
            WHEN rn > 1 THEN 'dim_advisor_pkey'
       END AS reason
FROM x;

INSERT INTO mart.dq_exceptions (source_table, source_key, rule_name, rule_detail, raw_record)
SELECT 'advisors', advisor_id::text, reason, 'rejected: ' || reason, raw FROM _adv WHERE reason IS NOT NULL;

INSERT INTO mart.dim_advisor (advisor_id, advisor_name, branch, team, join_date)
SELECT advisor_id, advisor_name, branch, team, join_date FROM _adv WHERE reason IS NULL;
