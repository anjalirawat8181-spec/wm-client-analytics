# Query Optimisation Demo

Measured by `automation/optimization_demo.py` on 2026-11-09 07:51 UTC, against the Neon database. Times are the server-side `Execution Time` from `EXPLAIN (ANALYZE, BUFFERS)`, 5 runs each, median reported.

## The query

A monthly roll-up filtered by `snapshot_date` across all clients (AUM and client count by segment and asset class):

```sql
SELECT c.segment, p.asset_class,
       count(DISTINCT h.client_id) AS clients,
       sum(h.market_value)         AS aum
FROM mart.fact_holdings_monthly h
JOIN mart.dim_client  c ON c.client_id  = h.client_id
JOIN mart.dim_product p ON p.product_id = h.product_id
WHERE h.snapshot_date = DATE '2026-10-31'
GROUP BY c.segment, p.asset_class
ORDER BY c.segment, p.asset_class
```

`fact_holdings_monthly` holds 427,985 rows; the filtered month holds 18,761 (4.4%).

## Why it was slow

The primary key is `(client_id, product_id, snapshot_date)`. It starts with `client_id`, so a filter on `snapshot_date` alone cannot use it and the planner must read the whole table.

## The change

```sql
CREATE INDEX IF NOT EXISTS idx_holdings_snapshot_date
    ON mart.fact_holdings_monthly (snapshot_date)
    INCLUDE (client_id, product_id, market_value);
```

Index size: 16.6 MB.

## Result

| | Before | After |
|---|---:|---:|
| Median execution time (ms) | 60.5 | 26.7 |
| Median planning time (ms) | 0.3 | 0.3 |
| Median shared buffers hit | 6,784 | 252 |
| Median shared buffers read | 0 | 0 |
| Scan node on holdings | Seq Scan on table | Index Only Scan on idx_holdings_snapshot_date |

Change in median execution time: -55.8%. The planner used the new index and execution time fell.

All runs (execution ms): before 62.3, 59.4, 65.7, 60.5, 58.2; after 28.0, 26.7, 26.4, 30.2, 26.4.

## Plans

Before:
```
GroupAggregate  (cost=10337.96..12699.82 rows=18 width=57) (actual time=48.489..60.357 rows=18.00 loops=1)
  Group Key: c.segment, p.asset_class
  Buffers: shared hit=6784
  ->  Gather Merge  (cost=10337.96..12512.86 rows=18674 width=29) (actual time=48.344..58.224 rows=18761.00 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=6784
        ->  Sort  (cost=9337.94..9357.39 rows=7781 width=29) (actual time=39.871..40.668 rows=6253.67 loops=3)
              Sort Key: c.segment, p.asset_class, h.client_id
              Sort Method: quicksort  Memory: 783kB
              Buffers: shared hit=6784
              Worker 0:  Sort Method: quicksort  Memory: 437kB
              Worker 1:  Sort Method: quicksort  Memory: 436kB
              ->  Hash Join  (cost=265.97..8835.06 rows=7781 width=29) (actual time=5.680..29.257 rows=6253.67 loops=3)
                    Hash Cond: (h.product_id = p.product_id)
                    Buffers: shared hit=6754
                    ->  Hash Join  (cost=264.50..8809.04 rows=7781 width=27) (actual time=5.659..28.368 rows=6253.67 loops=3)
                          Hash Cond: (h.client_id = c.client_id)
                          Buffers: shared hit=6751
                          ->  Parallel Seq Scan on fact_holdings_monthly h  (cost=0.00..8524.09 rows=7781 width=16) (actual time=0.644..19.674 rows=6253.67 loops=3)
                                Filter: (snapshot_date = '2026-10-31'::date)
                                Rows Removed by Filter: 136408
                                Buffers: shared hit=6295
                          ->  Hash  (cost=202.00..202.00 rows=5000 width=15) (actual time=4.999..5.000 rows=5000.00 loops=3)
                                Buckets: 8192  Batches: 1  Memory Usage: 302kB
                                Buffers: shared hit=456
                                ->  Seq Scan on dim_client c  (cost=0.00..202.00 rows=5000 width=15) (actual time=0.044..0.470 rows=5000.00 loops=3)
                                      Buffers: shared hit=456
                    ->  Hash  (cost=1.21..1.21 rows=21 width=10) (actual time=0.017..0.017 rows=21.00 loops=3)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=3
                          ->  Seq Scan on dim_product p  (cost=0.00..1.21 rows=21 width=10) (actual time=0.011..0.013 rows=21.00 loops=3)
                                Buffers: shared hit=3
Planning:
  Buffers: shared hit=22
Planning Time: 0.295 ms
Execution Time: 60.419 ms
```

After:
```
GroupAggregate  (cost=2410.69..2645.42 rows=18 width=57) (actual time=23.438..26.474 rows=18.00 loops=1)
  Group Key: c.segment, p.asset_class
  Buffers: shared hit=252
  ->  Sort  (cost=2410.69..2457.59 rows=18760 width=29) (actual time=23.352..24.205 rows=18761.00 loops=1)
        Sort Key: c.segment, p.asset_class, h.client_id
        Sort Method: quicksort  Memory: 1655kB
        Buffers: shared hit=252
        ->  Hash Join  (cost=266.39..1079.16 rows=18760 width=29) (actual time=0.933..7.750 rows=18761.00 loops=1)
              Hash Cond: (h.product_id = p.product_id)
              Buffers: shared hit=252
              ->  Hash Join  (cost=264.92..1018.51 rows=18760 width=27) (actual time=0.916..5.210 rows=18761.00 loops=1)
                    Hash Cond: (h.client_id = c.client_id)
                    Buffers: shared hit=251
                    ->  Index Only Scan using idx_holdings_snapshot_date on fact_holdings_monthly h  (cost=0.42..704.72 rows=18760 width=16) (actual time=0.007..1.564 rows=18761.00 loops=1)
                          Index Cond: (snapshot_date = '2026-10-31'::date)
                          Heap Fetches: 0
                          Index Searches: 1
                          Buffers: shared hit=99
                    ->  Hash  (cost=202.00..202.00 rows=5000 width=15) (actual time=0.905..0.906 rows=5000.00 loops=1)
                          Buckets: 8192  Batches: 1  Memory Usage: 302kB
                          Buffers: shared hit=152
                          ->  Seq Scan on dim_client c  (cost=0.00..202.00 rows=5000 width=15) (actual time=0.031..0.447 rows=5000.00 loops=1)
                                Buffers: shared hit=152
              ->  Hash  (cost=1.21..1.21 rows=21 width=10) (actual time=0.014..0.015 rows=21.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 9kB
                    Buffers: shared hit=1
                    ->  Seq Scan on dim_product p  (cost=0.00..1.21 rows=21 width=10) (actual time=0.008..0.010 rows=21.00 loops=1)
                          Buffers: shared hit=1
Planning:
  Buffers: shared hit=22
Planning Time: 0.287 ms
Execution Time: 26.526 ms
```

## Caveats

- Server-side times only; they exclude network latency to Neon, which is larger than the query itself.
- The table is small (hundreds of thousands of rows), so absolute gains are small. The index matters more as history grows.
- The first run of each set may read from disk; the median of 5 limits that effect.
