CREATE OR REPLACE VIEW analytics.v_client_month_nnm AS
SELECT t.client_id,
       (date_trunc('month', t.txn_date) + interval '1 month - 1 day')::date AS snapshot_date,
       coalesce(sum(t.amount) FILTER (WHERE t.flow_type = 'external_in'), 0)  AS inflows,
       coalesce(sum(t.amount) FILTER (WHERE t.flow_type = 'external_out'), 0) AS outflows,
       coalesce(sum(CASE t.flow_type WHEN 'external_in' THEN t.amount
                                     WHEN 'external_out' THEN -t.amount ELSE 0 END), 0) AS nnm
FROM mart.fact_transactions t
GROUP BY t.client_id, (date_trunc('month', t.txn_date) + interval '1 month - 1 day')::date;
