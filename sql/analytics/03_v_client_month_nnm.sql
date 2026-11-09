-- View: analytics.v_client_month_nnm
-- Business question: How much new money did each client add or take out each month?
-- KPI dictionary refs: Net New Money (external_in minus external_out; internal switches excluded; dated by transaction date).
-- Grain: one row per client x calendar month (keyed by the month-end date) that has at least one external flow.
CREATE OR REPLACE VIEW analytics.v_client_month_nnm AS
SELECT t.client_id,
       (date_trunc('month', t.txn_date) + interval '1 month - 1 day')::date AS snapshot_date,
       coalesce(sum(t.amount) FILTER (WHERE t.flow_type = 'external_in'), 0)  AS inflows,
       coalesce(sum(t.amount) FILTER (WHERE t.flow_type = 'external_out'), 0) AS outflows,
       coalesce(sum(CASE t.flow_type WHEN 'external_in' THEN t.amount
                                     WHEN 'external_out' THEN -t.amount ELSE 0 END), 0) AS nnm
FROM mart.fact_transactions t
GROUP BY t.client_id, (date_trunc('month', t.txn_date) + interval '1 month - 1 day')::date;
