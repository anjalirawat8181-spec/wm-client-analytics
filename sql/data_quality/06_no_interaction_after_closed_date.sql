SELECT count(*), count(*) FILTER (WHERE c.closed_date IS NOT NULL AND i.interaction_date > c.closed_date)
FROM mart.fact_interactions i JOIN mart.dim_client c USING (client_id);
