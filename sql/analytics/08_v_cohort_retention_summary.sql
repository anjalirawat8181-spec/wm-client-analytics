-- View: analytics.v_cohort_retention_summary
-- Business question: How well do new clients stick at 3, 6 and 12 months?
-- KPI dictionary refs: Active client; cohort definition as in v_cohort_retention.
-- Grain: one row per cohort month, with retention % at 3, 6 and 12 months (NULL until that month is observable).
CREATE OR REPLACE VIEW analytics.v_cohort_retention_summary AS
SELECT r.cohort_month,
       max(r.cohort_size)                                                         AS cohort_size,
       max(r.retention_pct) FILTER (WHERE r.months_since_onboarding = 3)          AS retention_3m_pct,
       max(r.retention_pct) FILTER (WHERE r.months_since_onboarding = 6)          AS retention_6m_pct,
       max(r.retention_pct) FILTER (WHERE r.months_since_onboarding = 12)         AS retention_12m_pct
FROM analytics.v_cohort_retention r
GROUP BY r.cohort_month;
