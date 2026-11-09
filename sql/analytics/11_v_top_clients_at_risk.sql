CREATE OR REPLACE VIEW analytics.v_top_clients_at_risk AS
SELECT row_number() OVER (ORDER BY r.risk_score DESC, r.aum DESC, r.client_id) AS priority_rank,
       r.client_id, r.segment, r.branch, r.advisor_id, r.aum, r.days_since_last_contact,
       r.risk_score, r.risk_level, r.reasons
FROM analytics.v_churn_risk_score r
WHERE r.snapshot_date = (SELECT max(snapshot_date) FROM analytics.v_snapshot_months)
  AND r.risk_level IN ('High', 'Medium');
