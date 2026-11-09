-- Business-rule checks on the mart. automation/dq_report.py runs each block.
-- Block format:  -- check: <rule name> | <description>
-- Every block returns one row: (checked, failures). A rule passes when failures = 0.
-- The roll-forward block needs the temp table _mr (product_id, month_end, ret), which dq_report loads from
-- data_generation/output/truth/market_returns.csv before running the checks.

-- check: roll_forward_identity | end value = round((prev value + net flows) x (1 + product return)), tolerance 1 rupee
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

-- check: roll_forward_exact | same identity with zero tolerance (informational: rounding of the stored return)
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
SELECT count(*), count(*) FILTER (WHERE ret IS NULL OR mv <> round((prev + net) * (1 + ret))) FROM r;

-- check: switch_pairs_balance | every switch_out has a switch_in on the next txn_id: same client, date, amount, different product
WITH o AS (SELECT * FROM mart.fact_transactions WHERE txn_type = 'switch_out')
SELECT (SELECT count(*) FROM o),
       (SELECT count(*) FROM o LEFT JOIN mart.fact_transactions i
          ON i.txn_id = o.txn_id + 1 AND i.txn_type = 'switch_in' AND i.client_id = o.client_id
         AND i.txn_date = o.txn_date AND i.amount = o.amount AND i.product_id <> o.product_id
        WHERE i.txn_id IS NULL)
     + abs((SELECT count(*) FROM mart.fact_transactions WHERE txn_type = 'switch_in') - (SELECT count(*) FROM o));

-- check: deposits_withdrawals_on_cash | deposits and withdrawals attach to the Cash product
SELECT count(*), count(*) FILTER (WHERE p.asset_class <> 'Cash')
FROM mart.fact_transactions t JOIN mart.dim_product p USING (product_id)
WHERE t.txn_type IN ('deposit','withdrawal');

-- check: no_txn_after_closed_date | no transaction dated after the client's closed_date
SELECT count(*), count(*) FILTER (WHERE c.closed_date IS NOT NULL AND t.txn_date > c.closed_date)
FROM mart.fact_transactions t JOIN mart.dim_client c USING (client_id);

-- check: no_interaction_after_closed_date | no interaction dated after the client's closed_date
SELECT count(*), count(*) FILTER (WHERE c.closed_date IS NOT NULL AND i.interaction_date > c.closed_date)
FROM mart.fact_interactions i JOIN mart.dim_client c USING (client_id);

-- check: no_holdings_from_closure_month_end | closed clients have no holdings from the closure month-end onward (KPI: AUM is 0 there)
SELECT count(*), count(*) FILTER (WHERE c.closed_date IS NOT NULL
         AND h.snapshot_date >= (date_trunc('month', c.closed_date) + interval '1 month - 1 day')::date)
FROM mart.fact_holdings_monthly h JOIN mart.dim_client c USING (client_id);

-- check: no_revenue_from_closure_month_end | closed clients have no revenue row from the closure month-end onward
SELECT count(*), count(*) FILTER (WHERE c.closed_date IS NOT NULL
         AND r.month_end >= (date_trunc('month', c.closed_date) + interval '1 month - 1 day')::date)
FROM mart.fact_revenue r JOIN mart.dim_client c USING (client_id);

-- check: no_holdings_before_onboarding | no holdings before the onboarding month-end
SELECT count(*), count(*) FILTER (WHERE h.snapshot_date <
         (date_trunc('month', c.onboarding_date) + interval '1 month - 1 day')::date)
FROM mart.fact_holdings_monthly h JOIN mart.dim_client c USING (client_id);

-- check: revenue_formula | fee_revenue = sum(market_value x fee_pct / 100 / 12) within half a rupee (rounding), one row per client with holdings
WITH exp AS (
    SELECT h.client_id, h.snapshot_date AS me, sum(h.market_value * p.fee_pct / 100.0 / 12.0) AS e
    FROM mart.fact_holdings_monthly h JOIN mart.dim_product p USING (product_id)
    GROUP BY 1, 2
)
SELECT count(*), count(*) FILTER (WHERE r.client_id IS NULL OR x.client_id IS NULL OR abs(r.fee_revenue - x.e) > 0.5)
FROM exp x FULL JOIN mart.fact_revenue r ON r.client_id = x.client_id AND r.month_end = x.me;

-- check: segment_matches_onboarding_aum | segment follows the onboarding_aum bands (25 lakh and 5 crore fall in HNI)
SELECT count(*), count(*) FILTER (WHERE segment <>
       CASE WHEN onboarding_aum < 2500000 THEN 'Mass Affluent'
            WHEN onboarding_aum <= 50000000 THEN 'HNI' ELSE 'UHNI' END)
FROM mart.dim_client;

-- check: dim_date_coverage | 1461 contiguous days, and every fact date lies inside the table
SELECT 1,
       (CASE WHEN (SELECT count(*) FROM mart.dim_date) = 1461
              AND (SELECT max(full_date) - min(full_date) + 1 FROM mart.dim_date) = 1461 THEN 0 ELSE 1 END)
     + (SELECT count(*) FROM mart.fact_transactions t LEFT JOIN mart.dim_date d ON d.full_date = t.txn_date WHERE d.full_date IS NULL)
     + (SELECT count(*) FROM mart.fact_interactions t LEFT JOIN mart.dim_date d ON d.full_date = t.interaction_date WHERE d.full_date IS NULL)
     + (SELECT count(*) FROM mart.fact_holdings_monthly t LEFT JOIN mart.dim_date d ON d.full_date = t.snapshot_date WHERE d.full_date IS NULL)
     + (SELECT count(*) FROM mart.fact_revenue t LEFT JOIN mart.dim_date d ON d.full_date = t.month_end WHERE d.full_date IS NULL);

-- check: no_orphans_in_mart | no fact row points at a missing client (FKs enforce this; this proves it independently)
SELECT (SELECT count(*) FROM mart.fact_transactions) + (SELECT count(*) FROM mart.fact_holdings_monthly)
     + (SELECT count(*) FROM mart.fact_interactions) + (SELECT count(*) FROM mart.fact_revenue),
       (SELECT count(*) FROM mart.fact_transactions t WHERE NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = t.client_id))
     + (SELECT count(*) FROM mart.fact_holdings_monthly t WHERE NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = t.client_id))
     + (SELECT count(*) FROM mart.fact_interactions t WHERE NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = t.client_id))
     + (SELECT count(*) FROM mart.fact_revenue t WHERE NOT EXISTS (SELECT 1 FROM mart.dim_client c WHERE c.client_id = t.client_id));

-- check: no_nulls_and_negatives | no NULL KYC, no non-positive amount, no negative market value in the mart
SELECT (SELECT count(*) FROM mart.dim_client) + (SELECT count(*) FROM mart.fact_transactions) + (SELECT count(*) FROM mart.fact_holdings_monthly),
       (SELECT count(*) FROM mart.dim_client WHERE kyc_status IS NULL)
     + (SELECT count(*) FROM mart.fact_transactions WHERE amount <= 0)
     + (SELECT count(*) FROM mart.fact_holdings_monthly WHERE market_value < 0);
