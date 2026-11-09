INSERT INTO mart.dim_date (date_key, full_date, year, quarter, month, month_name,
                           month_start, month_end, is_month_end)
SELECT to_char(d, 'YYYYMMDD')::integer,
       d::date,
       EXTRACT(YEAR FROM d)::smallint,
       EXTRACT(QUARTER FROM d)::smallint,
       EXTRACT(MONTH FROM d)::smallint,
       trim(to_char(d, 'Month')),
       date_trunc('month', d)::date,
       (date_trunc('month', d) + interval '1 month - 1 day')::date,
       ((d::date + 1) = date_trunc('month', d + interval '1 day')::date)
FROM generate_series(timestamp '2024-01-01', timestamp '2027-12-31', interval '1 day') AS g(d)
ON CONFLICT (date_key) DO NOTHING;
