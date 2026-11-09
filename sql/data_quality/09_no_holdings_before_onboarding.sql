SELECT count(*), count(*) FILTER (WHERE h.snapshot_date <
         (date_trunc('month', c.onboarding_date) + interval '1 month - 1 day')::date)
FROM mart.fact_holdings_monthly h JOIN mart.dim_client c USING (client_id);
