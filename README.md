# wm-client-analytics

## Problem statement

_TODO_

## Live dashboard

- Link: _TODO (Tableau Public URL)_
- Screenshot: _TODO_

## Architecture

_TODO_

## Data model

_TODO_

### Synthetic data

All data is fictional and produced by a seeded generator (`data_generation/`), so any run can be reproduced exactly. It plants known behaviours (contact gaps, segment effects, pre-churn outflows, advisor differences) and a known set of dirty records. How it is built is described in [docs/data_generation_notes.md](docs/data_generation_notes.md); whether the planted patterns are actually present is checked in [docs/pattern_validation.md](docs/pattern_validation.md).

## ETL and analytics

1. **Staging to mart.** `python automation/run_etl.py --confirm-rebuild "REBUILD mart"` promotes the raw staging tables into the constrained mart in one transaction (SQL in `sql/etl/`). Duplicate transaction IDs are collapsed to one row, negative amounts and negative market values are rejected, rows pointing at unknown clients are rejected, and a missing KYC status is promoted as `pending`. Every rejected or remediated row is kept in `mart.dq_exceptions` with its raw record. `--dry-run` does the work and rolls back.
2. **Data quality proof.** `python automation/dq_report.py` reconciles row counts, compares what was caught with the generator's answer key, compares the mart with the clean CSVs and runs the business-rule checks in `sql/data_quality/`. Results: [docs/dq_scorecard.md](docs/dq_scorecard.md).
3. **Analytics views.** `python automation/apply_analytics.py` (re)creates the documented views in `sql/analytics/` (schema `analytics`). Each file states its business question, the KPI dictionary rules it follows and its grain. `python automation/validate_analytics.py` checks them against an independent pandas calculation: [docs/analytics_validation.md](docs/analytics_validation.md).
4. **Optimisation demo.** One monthly roll-up, measured before and after one index: [docs/query_optimization.md](docs/query_optimization.md).

## Key findings

_TODO_

## KPI dictionary

See [docs/kpi_dictionary.md](docs/kpi_dictionary.md).

## How to run

_TODO_

## Tech stack

_TODO_

## Repo structure

_TODO_
