CREATE OR REPLACE VIEW analytics.v_asset_allocation_mix AS
WITH agg AS (
    SELECT h.snapshot_date, coalesce(c.segment, 'All') AS segment, p.asset_class, sum(h.market_value) AS value
    FROM mart.fact_holdings_monthly h
    JOIN mart.dim_product p ON p.product_id = h.product_id
    JOIN mart.dim_client c ON c.client_id = h.client_id
    GROUP BY GROUPING SETS ((h.snapshot_date, c.segment, p.asset_class), (h.snapshot_date, p.asset_class))
)
SELECT a.snapshot_date, a.segment, a.asset_class, a.value,
       round(100.0 * a.value / sum(a.value) OVER (PARTITION BY a.snapshot_date, a.segment), 2) AS share_pct
FROM agg a;
