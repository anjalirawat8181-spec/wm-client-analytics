SELECT (SELECT count(*) FROM mart.fact_transactions) + (SELECT count(*) FROM mart.fact_holdings_monthly)
     + (SELECT count(*) FROM mart.fact_interactions) + (SELECT count(*) FROM mart.fact_revenue),
       (SELECT count(*) FROM mart.fact_transactions t WHERE NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = t.client_id))
     + (SELECT count(*) FROM mart.fact_holdings_monthly t WHERE NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = t.client_id))
     + (SELECT count(*) FROM mart.fact_interactions t WHERE NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = t.client_id))
     + (SELECT count(*) FROM mart.fact_revenue t WHERE NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = t.client_id));
