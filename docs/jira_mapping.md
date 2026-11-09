# JIRA mapping

Ticket titles for WMCA-8 to WMCA-13 are taken from the board screenshots in `docs/jira_backlog.jpg`. I do not have titles for WMCA-14, 15 and 20, so those rows say what the repository contains instead of guessing a title. Ticket status in JIRA itself is updated by hand and is not shown here.

| Ticket | Title (source) | Commits | Files |
|---|---|---|---|
| WMCA-8 | Set up repo, Neon DB, and connection test (board) | `9d4c086` Initial scaffold | `automation/test_connection.py`, `requirements.txt`, `.gitignore` |
| WMCA-9 | Write KPI dictionary (board) | `494f311`, `d7e548b` | `docs/kpi_dictionary.md`, `docs/jira_backlog.jpg`, `docs/jira_sprint1.jpg` |
| WMCA-10 | Write data design notes (board) | `9d4c086` | `docs/data_design_notes.md` |
| WMCA-11 | Audit and fix Step 1 deliverables (board) | `c36b168` | `docs/kpi_dictionary.md`, `docs/data_design_notes.md` |
| WMCA-12 | Write DDL for staging and mart schemas (board) | `cecba81` | `sql/schema/01_create_schemas.sql`, `02_staging_tables.sql`, `03_mart_tables.sql`, `automation/apply_schema.py`, `automation/verify_schema.py` |
| WMCA-13 | Draw ER diagram (board) | `cecba81` | `docs/er-diagram.png`, `docs/er_diagram.mmd`, `docs/er_diagram.dbml`, `docs/er_diagram.md` |
| WMCA-14 | Title not available to me. Repository evidence: synthetic data generator | `ea65319` | `data_generation/generate.py`, `config.py`, `check_clean_data.py` |
| WMCA-15 | Title not available to me. Repository evidence: staging load and pattern validation | `8e8c011`, `7a8fc86`, `0825968`, `a281c8f` | `data_generation/load_staging.py`, `validate_patterns.py`, `docs/pattern_validation.md`, `docs/data_generation_notes.md` |
| WMCA-16 | Staging to mart ETL (commit message) | `0a2bbc2` | `sql/etl/01..07_*.sql`, `sql/schema/04_populate_dim_date.sql`, `automation/run_etl.py`, `automation/db.py` |
| WMCA-17 | Analytics views, validation and index demo (commit message) | `43db26b` | `sql/analytics/*.sql`, `automation/apply_analytics.py`, `validate_analytics.py`, `optimization_demo.py`, `sql/schema/05_performance_indexes.sql`, `docs/analytics_validation.md`, `docs/query_optimization.md` |
| WMCA-18 | Data quality checks and scorecard (commit message) | `bdb68be` | `sql/data_quality/business_rules.sql`, `automation/dq_report.py`, `docs/dq_scorecard.md`, `reports/dq_scorecard.json` |
| WMCA-19 | Premium web dashboard (commit messages) | see `git log --grep WMCA-19` | `automation/export_dashboard_data.py`, `dashboards/web/`, `dashboards/tableau_extracts/`, `docs/screenshots/`, `docs/dashboard_qa.md` |
| WMCA-20 | Title not available to me. Not mapped; the Tableau extracts exist but no Tableau workbook was built | none | `dashboards/tableau_extracts/*.csv` only |
| WMCA-21 | Weekly pipeline, Excel report, CI and Pages deployment (commit messages) | see `git log --grep WMCA-21` | `automation/refresh_pipeline.py`, `build_weekly_report.py`, `.github/workflows/ci.yml`, `deploy.yml`, `tests/` |
| WMCA-22 | README, BRD, user stories, memo, interview notes (commit message) | see `git log --grep WMCA-22` | `README.md`, `docs/brd.md`, `user_stories.md`, `insights_memo.md`, `interview_notes.md`, `jira_mapping.md`, `resume_bullets.md` |
