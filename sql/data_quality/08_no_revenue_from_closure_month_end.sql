SELECT count(*), count(*) FILTER (WHERE c.closed_date IS NOT NULL
         AND r.month_end >= (date_trunc('month', c.closed_date) + interval '1 month - 1 day')::date)
FROM mart.fact_revenue r JOIN mart.dim_client c USING (client_id);
