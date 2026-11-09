# Interview notes

Twelve questions I expect about this project, with answers I can defend from the repository.

**1. Walk me through the architecture.**
A seeded generator writes clean and deliberately dirty CSVs. The dirty set is loaded unchanged into a `staging` schema. One SQL transaction promotes it into a constrained `mart` star schema, logging every rejected row to `mart.dq_exceptions`. Documented views in an `analytics` schema compute the KPIs. A Python export turns those views into JSON, a React app reads the JSON, and GitHub Actions rebuilds and deploys it weekly.

**2. Why a star schema?**
The questions are all "measure by slice and month": AUM by segment and branch, attrition by month. Facts at a stable grain (client x product x month-end, transaction, interaction, client x month revenue) joined to small dimensions keeps the KPI SQL simple and avoids double counting. The grain of each table is written in a table comment.

**3. Why staging and a separate mart?**
Staging accepts anything, so a bad row never blocks a load and the raw record is always preserved. The mart enforces the rules with constraints (for example the segment must match onboarding AUM, a transaction type must pair with its flow type). The ETL's job is to decide, row by row, which side of that line a record falls on, and to write down why.

**4. How did you prove the data quality checks work?**
The generator records every defect it injects. After the ETL, I compared the exceptions table with that answer key per defect type: 18,198 planted, 18,198 caught, none missed, no false positives. I also reconciled counts (every staged row is loaded or logged) and compared the mart with the clean CSVs: identical except the 125 missing KYC values, which are promoted as "pending". The caveat I state up front: with synthetic data you have an answer key; with real data you do not, which is why the business-rule checks (roll-forward identity, switch pairs balance, nothing after a close date) matter.

**5. Where did you use window functions?**
`LAG` for previous-month status and AUM three months back (churn and AUM-drop flags), `LAG` with offset 12 and a 12-row `MAX` frame for trailing 12-month attrition, `SUM() OVER` for segment AUM, `RANK` and `DENSE_RANK` for AUM rank and advisor ranks, `NTILE(10)` for advisor deciles, `FIRST_VALUE` for cohort size, and `GROUPING SETS` for segment and "All" totals in one pass.

**6. What did your optimisation demo show?**
A monthly AUM roll-up filtered on `snapshot_date` read the whole holdings table because the primary key starts with `client_id`. One covering index on `snapshot_date` turned a parallel sequential scan into an index-only scan: median execution time fell from 60.5 ms to 26.7 ms over 5 runs each (about 56%). The honest framing: the table is small, so the absolute gain is small, and it excludes network latency to Neon.

**7. How do you define churn, and what is tricky about it?**
Active at the previous month-end and then closed or below Rs 1 lakh at this month-end. The tricky parts are the denominator (only clients active last month-end, new joiners excluded), the silent churners who keep an open account with a near-empty balance, and that the first month has no previous month. I also report a trailing 12-month figure built only from the opening group so it cannot exceed 100%.

**8. What are the limits of synthetic data?**
Patterns are found because they were planted, so strong results (an AUM drop precedes departure for 88% of flagged cases) say the method works, not that real clients behave like that. There are no real market prices, returning clients are not simulated, and the generator has quirks I found and documented: clients onboarded in January 2025 have no holdings.

**9. Did your validation find any gaps?**
Yes, and I reported them rather than changing thresholds. Ranking advisors by net flow rate (12-month net new money divided by opening AUM, a standard organic growth measure chosen because it compares books of different sizes) placed only 2 of the 5 planted high-growth advisors in the top ten, against a threshold of 4. The group average was about twice the other advisors' average (14.9% against 7.4%), but individual advisors overlap heavily over one year. The low-contact advisors were all found. Idle-client recall sits exactly at its 90% threshold.

**10. Why React and a static site instead of Tableau?**
I wanted a dashboard anyone can open from a link with no licence, rebuilt automatically, whose numbers I could test (Vitest for formatters and filters, a script that compares rendered numbers with SQL). The trade-off is a snapshot, not a live connection, and more code than a drag-and-drop tool. Tableau extracts are exported for anyone who wants a workbook; I did not build one.

**11. How is it secured?**
No secrets in the repository; local runs read `.env` (git-ignored); CI reads the database URL from a repository secret and no script prints it. The site is static and the browser never reaches the database. Only client IDs are exported, never names.

**12. What would you do next?**
Add authentication and row-level security for a real deployment, move from weekly snapshots to incremental loads, simulate returning clients and time-varying segments, show idle and concentrated client lists on the site, and back-test the risk score on data I did not generate.
