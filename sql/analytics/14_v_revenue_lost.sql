-- View: analytics.v_revenue_lost
-- Business question: How much monthly fee revenue walked out the door with the clients we lost?
-- KPI dictionary refs: Revenue per Client edge case: revenue lost for a churned client = their fee revenue at the last month-end
--   before churn, reported in the churn month. Churned client = active at previous month-end AND (closed OR AUM < 100000 now).
-- Grain: one row per month-end x segment, plus segment = 'All', for months with at least one churned client.
CREATE OR REPLACE VIEW analytics.v_revenue_lost AS
SELECT k.snapshot_date,
       coalesce(k.segment, 'All')    AS segment,
       count(*)                      AS churned_clients,
       sum(r.fee_revenue)            AS revenue_lost
FROM analytics.v_client_month_kpis k
JOIN mart.fact_revenue r
  ON r.client_id = k.client_id
 AND r.month_end = (date_trunc('month', k.snapshot_date) - interval '1 day')::date
WHERE k.was_active AND NOT k.is_active
GROUP BY GROUPING SETS ((k.snapshot_date, k.segment), (k.snapshot_date));
