CREATE INDEX IF NOT EXISTS idx_holdings_snapshot_date
    ON mart.fact_holdings_monthly (snapshot_date)
    INCLUDE (client_id, product_id, market_value);
