CREATE OR REPLACE VIEW analytics.v_risk_distribution AS
SELECT r.snapshot_date,
       coalesce(r.segment, 'All')  AS segment,
       r.risk_level,
       count(*)                    AS clients,
       sum(r.aum)                  AS aum
FROM analytics.v_churn_risk_score r
WHERE r.snapshot_date = (SELECT max(snapshot_date) FROM analytics.v_snapshot_months)
GROUP BY GROUPING SETS ((r.snapshot_date, r.segment, r.risk_level), (r.snapshot_date, r.risk_level));
