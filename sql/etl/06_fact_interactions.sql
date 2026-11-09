-- ETL step 6: staging.interactions -> mart.fact_interactions
-- Rule order: 3 orphan client, 5 any other constraint.
CREATE TEMP TABLE _int ON COMMIT DROP AS
WITH x AS (
    SELECT s.interaction_id, s.client_id, s.advisor_id, s.interaction_date, s.channel, s.outcome,
           to_jsonb(s) AS raw,
           row_number() OVER (PARTITION BY s.interaction_id ORDER BY s.ctid) AS rn
    FROM staging.interactions s
)
SELECT x.*,
       CASE WHEN NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = x.client_id) THEN 'orphan_client'
            WHEN interaction_id IS NULL OR advisor_id IS NULL OR interaction_date IS NULL
                 OR channel IS NULL OR outcome IS NULL THEN 'fact_interactions_not_null'
            WHEN rn > 1 THEN 'fact_interactions_pkey'
            WHEN NOT EXISTS (SELECT 1 FROM mart.dim_advisor a WHERE a.advisor_id = x.advisor_id) THEN 'fact_interactions_advisor_id_fkey'
            WHEN NOT EXISTS (SELECT 1 FROM mart.dim_date d WHERE d.full_date = x.interaction_date) THEN 'fact_interactions_interaction_date_fkey'
            WHEN channel NOT IN ('call','email','meeting','whatsapp') THEN 'fact_interactions_channel_check'
            WHEN outcome NOT IN ('connected','missed','no_response') THEN 'fact_interactions_outcome_check'
       END AS reason
FROM x;

INSERT INTO mart.dq_exceptions (source_table, source_key, rule_name, rule_detail, raw_record)
SELECT 'interactions', interaction_id::text, reason,
       CASE reason WHEN 'orphan_client' THEN 'client_id ' || coalesce(client_id::text, 'NULL') || ' not in dim_client'
                   ELSE 'rejected: ' || reason END,
       raw
FROM _int WHERE reason IS NOT NULL;

INSERT INTO mart.fact_interactions (interaction_id, client_id, advisor_id, interaction_date, channel, outcome)
SELECT interaction_id, client_id, advisor_id, interaction_date, channel, outcome FROM _int WHERE reason IS NULL;
