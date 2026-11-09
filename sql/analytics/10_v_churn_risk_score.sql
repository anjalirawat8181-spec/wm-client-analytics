CREATE OR REPLACE VIEW analytics.v_churn_risk_score AS
SELECT f.client_id, f.snapshot_date, f.segment, f.branch, f.advisor_id, f.aum, f.days_since_last_contact,
       s.risk_score,
       CASE WHEN s.risk_score >= 3 THEN 'High' WHEN s.risk_score >= 1 THEN 'Medium' ELSE 'Low' END AS risk_level,
       nullif(concat_ws(', ',
              CASE WHEN f.outflow_flag THEN 'AUM down over 50% in 3 months' END,
              CASE WHEN f.moderate_outflow_flag THEN 'AUM down 30-50% in 3 months' END,
              CASE f.contact_flag WHEN 'critical' THEN 'no contact for 180+ days'
                                  WHEN 'at_risk' THEN 'no contact for 90+ days' END,
              CASE WHEN f.idle_flag THEN 'idle cash above 30%' END), '') AS reasons
FROM analytics.v_flags f
CROSS JOIN LATERAL (
    SELECT (CASE WHEN f.outflow_flag THEN 3 WHEN f.moderate_outflow_flag THEN 1 ELSE 0 END)
         + (CASE f.contact_flag WHEN 'critical' THEN 2 WHEN 'at_risk' THEN 1 ELSE 0 END)
         + (CASE WHEN f.idle_flag THEN 1 ELSE 0 END) AS risk_score
) s
WHERE f.is_active;
