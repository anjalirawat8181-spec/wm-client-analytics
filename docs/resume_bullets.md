# Resume bullets

Pick the wording that matches what you can explain in an interview. Every number comes from a generated artefact in this repository.

1. Built an end-to-end client analytics pipeline on PostgreSQL (Neon): staged 770,759 synthetic records, promoted them through a single-transaction ETL into a constrained star schema, and logged every rejected or repaired row with its raw record to an audit table.
2. Proved data quality against a known answer key: caught 18,198 of 18,198 planted dirty records with 0 false positives, reconciled every staged row to loaded or logged, and ran 35 business-rule and reconciliation checks (roll-forward identity, switch-pair balance, post-closure activity).
3. Wrote 23 documented SQL views (window functions, CTEs, grouping sets) implementing a written KPI dictionary, cross-checked against independent pandas calculations; recovered 99% of planted churners at 100% precision, and cut a monthly roll-up from 60.5 ms to 26.7 ms with one covering index.
4. Shipped a static React and TypeScript dashboard (5 pages, light and dark themes, Indian currency formatting) with Vitest tests, Lighthouse accessibility of 100, and a GitHub Actions workflow that refreshes the data, builds an Excel report and redeploys to GitHub Pages every week.

## What not to claim

- **Tableau.** No Tableau workbook was built. CSV extracts exist in `dashboards/tableau_extracts/`; say "prepared extracts" at most, and only claim Tableau if you build and publish a workbook.
- **JIRA sprints.** Claim sprint delivery only for sprints you actually ran. The board screenshots in `docs/` show Sprint 1; the ticket statuses are updated by hand.
- **Real data or real business results.** All data is synthetic. Say "synthetic data with planted patterns", not "reduced attrition" or "increased AUM".
- **Predictive modelling.** The churn risk score is a transparent rule set, not a trained model. Say "rule-based risk scoring".
- **Advisor growth ranking.** Ranking advisors by net flow rate (12-month net new money over opening AUM) placed 2 of the 5 planted high-growth advisors in the top ten, below the 4 required, although the group's average rate was about twice that of other advisors; do not present it as a reliable per-advisor performance measure.
- **Live or real-time.** The dashboard is a weekly snapshot.
