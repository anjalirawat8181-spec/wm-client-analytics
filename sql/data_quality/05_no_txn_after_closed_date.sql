SELECT count(*), count(*) FILTER (WHERE c.closed_date IS NOT NULL AND t.txn_date > c.closed_date)
FROM mart.fact_transactions t JOIN mart.dim_client c USING (client_id);
