-- View: analytics.v_snapshot_months
-- Business question: Which month-end snapshots does the data cover?
-- KPI dictionary refs: Global definitions > Snapshot date (last calendar day of each month).
-- Grain: one row per month-end snapshot present in fact_holdings_monthly.
CREATE OR REPLACE VIEW analytics.v_snapshot_months AS
SELECT s.snapshot_date,
       row_number() OVER (ORDER BY s.snapshot_date)       AS month_index,
       date_trunc('month', s.snapshot_date)::date         AS month_start,
       to_char(s.snapshot_date, 'YYYY-MM')                AS month_label
FROM (SELECT DISTINCT snapshot_date FROM mart.fact_holdings_monthly) s;
