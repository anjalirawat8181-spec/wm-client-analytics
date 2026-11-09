WITH exp AS (
    SELECT h.client_id, h.snapshot_date AS me, sum(h.market_value * p.fee_pct / 100.0 / 12.0) AS e
    FROM mart.fact_holdings_monthly h JOIN mart.dim_product p USING (product_id)
    GROUP BY 1, 2
)
SELECT count(*), count(*) FILTER (WHERE r.client_id IS NULL OR x.client_id IS NULL OR abs(r.fee_revenue - x.e) > 0.5)
FROM exp x FULL JOIN mart.fact_revenue r ON r.client_id = x.client_id AND r.month_end = x.me;
