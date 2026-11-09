-- ETL step 3: staging.clients -> mart.dim_client
-- Rule 4: NULL kyc_status is promoted as 'pending' and logged as remediated (null_kyc).
-- Rule 5: any other constraint violation is rejected and logged with the constraint name.
CREATE TEMP TABLE _cli ON COMMIT DROP AS
WITH x AS (
    SELECT s.client_id, s.client_name, s.advisor_id, s.segment, s.onboarding_date,
           s.onboarding_aum, s.city, s.risk_profile,
           coalesce(s.kyc_status, 'pending') AS kyc_status,
           (s.kyc_status IS NULL) AS kyc_remediated,
           s.account_status, s.closed_date,
           to_jsonb(s) AS raw,
           row_number() OVER (PARTITION BY s.client_id ORDER BY s.ctid) AS rn
    FROM staging.clients s
)
SELECT x.*,
       CASE WHEN client_id IS NULL OR client_name IS NULL OR advisor_id IS NULL OR segment IS NULL
                 OR onboarding_date IS NULL OR onboarding_aum IS NULL OR city IS NULL
                 OR risk_profile IS NULL OR account_status IS NULL THEN 'dim_client_not_null'
            WHEN rn > 1 THEN 'dim_client_pkey'
            WHEN NOT EXISTS (SELECT 1 FROM mart.dim_advisor a WHERE a.advisor_id = x.advisor_id) THEN 'dim_client_advisor_id_fkey'
            WHEN segment NOT IN ('Mass Affluent','HNI','UHNI') THEN 'dim_client_segment_check'
            WHEN risk_profile NOT IN ('Conservative','Moderate','Aggressive') THEN 'dim_client_risk_profile_check'
            WHEN kyc_status NOT IN ('verified','pending','expired') THEN 'dim_client_kyc_status_check'
            WHEN account_status NOT IN ('open','closed') THEN 'dim_client_account_status_check'
            WHEN onboarding_aum < 0 OR onboarding_aum <> round(onboarding_aum) THEN 'dim_client_onboarding_aum_check'
            WHEN NOT ((segment = 'Mass Affluent' AND onboarding_aum < 2500000)
                   OR (segment = 'HNI' AND onboarding_aum BETWEEN 2500000 AND 50000000)
                   OR (segment = 'UHNI' AND onboarding_aum > 50000000)) THEN 'ck_client_segment_matches_aum'
            WHEN (account_status = 'closed') <> (closed_date IS NOT NULL) THEN 'ck_client_closed_date_iff_closed'
            WHEN closed_date IS NOT NULL AND closed_date < onboarding_date THEN 'ck_client_closed_after_onboarding'
       END AS reason
FROM x;

INSERT INTO mart.dq_exceptions (source_table, source_key, rule_name, rule_detail, raw_record)
SELECT 'clients', client_id::text, reason, 'rejected: ' || reason, raw FROM _cli WHERE reason IS NOT NULL;

INSERT INTO mart.dq_exceptions (source_table, source_key, rule_name, rule_detail, raw_record)
SELECT 'clients', client_id::text, 'null_kyc', 'remediated: kyc_status NULL promoted as pending', raw
FROM _cli WHERE reason IS NULL AND kyc_remediated;

INSERT INTO mart.dim_client (client_id, client_name, advisor_id, segment, onboarding_date, onboarding_aum,
                             city, risk_profile, kyc_status, account_status, closed_date)
SELECT client_id, client_name, advisor_id, segment, onboarding_date, onboarding_aum::bigint,
       city, risk_profile, kyc_status, account_status, closed_date
FROM _cli WHERE reason IS NULL;
