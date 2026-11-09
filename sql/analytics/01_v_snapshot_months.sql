CREATE OR REPLACE VIEW analytics.v_snapshot_months AS
SELECT s.snapshot_date,
       row_number() OVER (ORDER BY s.snapshot_date)       AS month_index,
       date_trunc('month', s.snapshot_date)::date         AS month_start,
       to_char(s.snapshot_date, 'YYYY-MM')                AS month_label
FROM (SELECT DISTINCT snapshot_date FROM mart.fact_holdings_monthly) s;
