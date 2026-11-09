-- Performance index added after the optimisation demo (see docs/query_optimization.md).
-- The holdings primary key starts with client_id, so a filter on snapshot_date alone cannot use it.
-- Every monthly roll-up (AUM, allocation, idle cash, concentration) filters by snapshot_date across all clients.
-- INCLUDE carries the columns the roll-up reads, so the query can be answered from the index without visiting the table.
CREATE INDEX IF NOT EXISTS idx_holdings_snapshot_date
    ON mart.fact_holdings_monthly (snapshot_date)
    INCLUDE (client_id, product_id, market_value);
