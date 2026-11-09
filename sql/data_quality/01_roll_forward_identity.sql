WITH flows AS (
    SELECT client_id, product_id,
           (date_trunc('month', txn_date) + interval '1 month - 1 day')::date AS me,
           sum(CASE WHEN txn_type IN ('deposit','sip','switch_in') THEN amount ELSE -amount END) AS net
    FROM mart.fact_transactions GROUP BY 1, 2, 3
), r AS (
    SELECT h.market_value AS mv, p.market_value AS prev, coalesce(f.net, 0) AS net, m.ret
    FROM mart.fact_holdings_monthly h
    JOIN mart.fact_holdings_monthly p
      ON p.client_id = h.client_id AND p.product_id = h.product_id
     AND p.snapshot_date = (date_trunc('month', h.snapshot_date) - interval '1 day')::date
    LEFT JOIN flows f ON f.client_id = h.client_id AND f.product_id = h.product_id AND f.me = h.snapshot_date
    LEFT JOIN _mr m ON m.product_id = h.product_id AND m.month_end = h.snapshot_date
)
SELECT count(*) AS checked,
       count(*) FILTER (WHERE ret IS NULL OR abs(mv - round((prev + net) * (1 + ret))) > 1) AS failures
FROM r;
