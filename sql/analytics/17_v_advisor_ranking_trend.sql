CREATE OR REPLACE VIEW analytics.v_advisor_ranking_trend AS
WITH m AS (
    SELECT k.advisor_id, k.snapshot_date,
           sum(k.aum)                           AS aum,
           count(*) FILTER (WHERE k.is_active)  AS active_clients,
           coalesce(sum(n.nnm), 0)              AS nnm
    FROM analytics.v_client_month_kpis k
    LEFT JOIN analytics.v_client_month_nnm n ON n.client_id = k.client_id AND n.snapshot_date = k.snapshot_date
    GROUP BY k.advisor_id, k.snapshot_date
),
r AS (
    SELECT m.*,
           sum(m.nnm) OVER (PARTITION BY m.advisor_id ORDER BY m.snapshot_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS nnm_3m,
           CASE WHEN lag(m.aum, 12) OVER w > 0
                THEN sum(m.nnm) OVER (w ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) / lag(m.aum, 12) OVER w END AS net_flow_rate,
           dense_rank() OVER (PARTITION BY m.snapshot_date ORDER BY m.aum DESC) AS aum_rank
    FROM m
    WINDOW w AS (PARTITION BY m.advisor_id ORDER BY m.snapshot_date)
),
r2 AS (
    SELECT r.*, CASE WHEN r.net_flow_rate IS NOT NULL
                     THEN dense_rank() OVER (PARTITION BY r.snapshot_date ORDER BY r.net_flow_rate DESC NULLS LAST) END AS net_flow_rank
    FROM r
)
SELECT r2.*,
       lag(r2.aum_rank) OVER (PARTITION BY r2.advisor_id ORDER BY r2.snapshot_date) AS prev_aum_rank,
       lag(r2.aum_rank) OVER (PARTITION BY r2.advisor_id ORDER BY r2.snapshot_date) - r2.aum_rank AS aum_rank_change
FROM r2;
