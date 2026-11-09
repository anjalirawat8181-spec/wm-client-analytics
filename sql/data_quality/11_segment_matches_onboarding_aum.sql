SELECT count(*), count(*) FILTER (WHERE segment <>
       CASE WHEN onboarding_aum < 2500000 THEN 'Mass Affluent'
            WHEN onboarding_aum <= 50000000 THEN 'HNI' ELSE 'UHNI' END)
FROM mart.dim_client;
