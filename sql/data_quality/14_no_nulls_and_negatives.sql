SELECT (SELECT count(*) FROM mart.dim_client) + (SELECT count(*) FROM mart.fact_transactions) + (SELECT count(*) FROM mart.fact_holdings_monthly),
       (SELECT count(*) FROM mart.dim_client WHERE kyc_status IS NULL)
     + (SELECT count(*) FROM mart.fact_transactions WHERE amount <= 0)
     + (SELECT count(*) FROM mart.fact_holdings_monthly WHERE market_value < 0);
