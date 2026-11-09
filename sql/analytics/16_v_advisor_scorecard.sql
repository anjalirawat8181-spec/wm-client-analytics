CREATE OR REPLACE VIEW analytics.v_advisor_scorecard AS
WITH lastm AS (
    SELECT max(snapshot_date) AS d, max(month_index) AS idx FROM analytics.v_snapshot_months
),
opening AS (
    SELECT k.advisor_id, sum(k.aum) AS opening_aum
    FROM analytics.v_client_month_kpis k
    JOIN analytics.v_snapshot_months m ON m.snapshot_date = k.snapshot_date
    JOIN lastm l ON m.month_index = l.idx - 12
    GROUP BY k.advisor_id
),
win AS (
    SELECT m.snapshot_date, m.month_start FROM analytics.v_snapshot_months m, lastm l WHERE m.month_index > l.idx - 12
),
book AS (
    SELECT k.advisor_id,
           count(*) FILTER (WHERE k.is_active AND k.snapshot_date = l.d)  AS active_clients,
           sum(k.aum) FILTER (WHERE k.snapshot_date = l.d)                AS aum,
           count(*) FILTER (WHERE k.is_active)                            AS client_months,
           coalesce(sum(n.nnm), 0)                                        AS nnm_12m
    FROM analytics.v_client_month_kpis k
    JOIN win w ON w.snapshot_date = k.snapshot_date
    CROSS JOIN lastm l
    LEFT JOIN analytics.v_client_month_nnm n ON n.client_id = k.client_id AND n.snapshot_date = k.snapshot_date
    GROUP BY k.advisor_id
),
contacts AS (
    SELECT i.advisor_id, count(*) AS connected_12m
    FROM mart.fact_interactions i
    JOIN win w ON i.interaction_date BETWEEN w.month_start AND w.snapshot_date
    WHERE i.outcome = 'connected'
    GROUP BY i.advisor_id
),
scored AS (
    SELECT a.advisor_id, a.branch, a.team, b.active_clients, b.aum, b.nnm_12m, o.opening_aum,
           b.nnm_12m / NULLIF(o.opening_aum, 0)                                           AS net_flow_rate,
           b.nnm_12m / NULLIF(b.client_months / 12.0, 0)                                  AS nnm_per_client,
           coalesce(c.connected_12m, 0)                                                   AS connected_contacts_12m,
           coalesce(c.connected_12m, 0)::numeric / NULLIF(b.client_months, 0)             AS contacts_per_client_month
    FROM mart.dim_advisor a
    LEFT JOIN book b ON b.advisor_id = a.advisor_id
    LEFT JOIN opening o ON o.advisor_id = a.advisor_id
    LEFT JOIN contacts c ON c.advisor_id = a.advisor_id
)
SELECT s.*,
       dense_rank() OVER (ORDER BY s.aum DESC NULLS LAST)                       AS aum_rank,
       dense_rank() OVER (ORDER BY s.net_flow_rate DESC NULLS LAST)             AS growth_rank,
       dense_rank() OVER (ORDER BY s.contacts_per_client_month DESC NULLS LAST) AS contact_rank,
       ntile(10) OVER (ORDER BY s.net_flow_rate DESC NULLS LAST)                AS growth_decile,
       ntile(10) OVER (ORDER BY s.contacts_per_client_month ASC NULLS LAST)     AS contact_decile
FROM scored s;
