-- View: analytics.v_cohort_retention
-- Business question: Of the clients who joined in a given month, how many are still active 1, 2, ... 12 months later?
-- KPI dictionary refs: Active client (open AND AUM >= 100000). Cohort = onboarding month, only for clients who onboarded
--   inside the data window (earlier clients have no observable start).
-- Grain: one row per cohort month x months since onboarding (0 to 12), only where that later month-end exists in the data.
-- Techniques: FIRST_VALUE window over the cohort to carry the cohort size.
CREATE OR REPLACE VIEW analytics.v_cohort_retention AS
WITH cohort AS (
    SELECT c.client_id,
           (date_trunc('month', c.onboarding_date) + interval '1 month - 1 day')::date AS cohort_month
    FROM mart.dim_client c
    WHERE c.onboarding_date >= (SELECT min(month_start) FROM analytics.v_snapshot_months)
),
obs AS (
    SELECT c.cohort_month, s.k AS months_since_onboarding, k.is_active
    FROM cohort c
    CROSS JOIN generate_series(0, 12) AS s(k)
    JOIN analytics.v_client_month_kpis k
      ON k.client_id = c.client_id
     AND k.snapshot_date = (date_trunc('month', c.cohort_month) + (s.k + 1) * interval '1 month' - interval '1 day')::date
),
agg AS (
    SELECT cohort_month, months_since_onboarding,
           count(*)                              AS clients_observed,
           count(*) FILTER (WHERE is_active)     AS retained_clients
    FROM obs
    GROUP BY cohort_month, months_since_onboarding
)
SELECT a.cohort_month,
       a.months_since_onboarding,
       first_value(a.clients_observed) OVER (PARTITION BY a.cohort_month ORDER BY a.months_since_onboarding) AS cohort_size,
       a.clients_observed,
       a.retained_clients,
       round(100.0 * a.retained_clients / a.clients_observed, 2) AS retention_pct
FROM agg a;
