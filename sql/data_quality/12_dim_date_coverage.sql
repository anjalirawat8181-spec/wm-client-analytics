SELECT 1,
       (CASE WHEN (SELECT count(*) FROM mart.dim_date) = 1461
              AND (SELECT max(full_date) - min(full_date) + 1 FROM mart.dim_date) = 1461 THEN 0 ELSE 1 END)
     + (SELECT count(*) FROM mart.fact_transactions t LEFT JOIN mart.dim_date d ON d.full_date = t.txn_date WHERE d.full_date IS NULL)
     + (SELECT count(*) FROM mart.fact_interactions t LEFT JOIN mart.dim_date d ON d.full_date = t.interaction_date WHERE d.full_date IS NULL)
     + (SELECT count(*) FROM mart.fact_holdings_monthly t LEFT JOIN mart.dim_date d ON d.full_date = t.snapshot_date WHERE d.full_date IS NULL)
     + (SELECT count(*) FROM mart.fact_revenue t LEFT JOIN mart.dim_date d ON d.full_date = t.month_end WHERE d.full_date IS NULL);
