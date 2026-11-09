-- View: analytics.v_client_month_kpis
-- Business question: For every client at every month-end, what is the AUM, cash share, concentration,
--   contact gap and activity status that all other KPIs are built from?
-- KPI dictionary refs: AUM (closed clients are 0 from the closure month-end), Idle Cash %, Concentration %
--   (largest NON-cash product / AUM, AUM includes cash), Days Since Last Contact (connected only; falls back to
--   onboarding date), Active client (open AND AUM >= 100000), Segment (fixed at onboarding).
-- Grain: one row per client x month-end, from the client's onboarding month-end to the last snapshot.
-- Techniques: CTEs, LAG (previous status, AUM 1 and 3 months ago), SUM OVER (segment AUM), RANK (AUM rank in segment).
CREATE OR REPLACE VIEW analytics.v_client_month_kpis AS
WITH grid AS (
    SELECT c.client_id, c.advisor_id, c.segment, c.onboarding_date, c.closed_date, m.snapshot_date
    FROM mart.dim_client c
    JOIN analytics.v_snapshot_months m
      ON m.snapshot_date >= (date_trunc('month', c.onboarding_date) + interval '1 month - 1 day')::date
),
hold AS (
    SELECT h.client_id, h.snapshot_date,
           sum(h.market_value)                                              AS aum,
           sum(h.market_value) FILTER (WHERE p.asset_class = 'Cash')        AS cash_value,
           max(h.market_value) FILTER (WHERE p.asset_class <> 'Cash')       AS top_noncash_value
    FROM mart.fact_holdings_monthly h
    JOIN mart.dim_product p USING (product_id)
    GROUP BY h.client_id, h.snapshot_date
),
contact AS (
    SELECT g.client_id, g.snapshot_date, max(i.interaction_date) AS last_connected
    FROM grid g
    JOIN mart.fact_interactions i
      ON i.client_id = g.client_id AND i.outcome = 'connected' AND i.interaction_date <= g.snapshot_date
    GROUP BY g.client_id, g.snapshot_date
),
base AS (
    SELECT g.client_id, g.advisor_id, a.branch, g.segment, g.onboarding_date, g.snapshot_date,
           coalesce(h.aum, 0)                                            AS aum,
           coalesce(h.cash_value, 0)                                     AS cash_value,
           h.top_noncash_value,
           (g.closed_date IS NULL OR g.closed_date > g.snapshot_date)    AS account_open,
           g.snapshot_date - coalesce(ct.last_connected, g.onboarding_date) AS days_since_last_contact
    FROM grid g
    JOIN mart.dim_advisor a ON a.advisor_id = g.advisor_id
    LEFT JOIN hold h ON h.client_id = g.client_id AND h.snapshot_date = g.snapshot_date
    LEFT JOIN contact ct ON ct.client_id = g.client_id AND ct.snapshot_date = g.snapshot_date
),
kpi AS (
    SELECT b.*,
           (b.account_open AND b.aum >= 100000) AS is_active,
           CASE WHEN b.aum >= 100000 THEN b.cash_value::numeric / b.aum END AS idle_cash_pct,
           CASE WHEN b.aum >= 100000 AND b.top_noncash_value IS NOT NULL
                THEN b.top_noncash_value::numeric / b.aum END AS concentration_pct
    FROM base b
)
SELECT k.*,
       lag(k.is_active) OVER w                                   AS was_active,
       lag(k.aum) OVER w                                         AS prev_aum,
       lag(k.aum, 3) OVER w                                      AS aum_3m_ago,
       sum(k.aum) OVER (PARTITION BY k.snapshot_date, k.segment) AS segment_aum,
       rank() OVER (PARTITION BY k.snapshot_date, k.segment ORDER BY k.aum DESC) AS aum_rank_in_segment,
       ((date_trunc('month', k.onboarding_date) + interval '1 month - 1 day')::date = k.snapshot_date) AS is_new_client
FROM kpi k
WINDOW w AS (PARTITION BY k.client_id ORDER BY k.snapshot_date);
