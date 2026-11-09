# Data Generation Notes

All data is fictional (names come from a seeded Faker `en_IN` generator; fund houses and funds are invented). Everything below is driven by `data_generation/config.py`.

## (a) Decisions

| Topic | Decision |
|---|---|
| Data window | 22 month-end snapshots, 2025-01-31 to 2026-10-31. Interaction history also exists for 6 months before the window (Jul-Dec 2024) so "days since last contact" is meaningful at the first snapshot. |
| Scale | 5,000 clients (IDs 10001-15000), 60 advisors (IDs 1-60), 4 branches (Mumbai, Delhi NCR, Bengaluru, Pune), 3 teams per branch, 21 products. `--small` builds 300 clients. |
| Segments | Fixed from `onboarding_aum`: Mass Affluent 72%, HNI 25%, UHNI 3%. Exactly 5 crore falls in HNI, matching the mart CHECK. |
| Closed clients | Closure is a full redemption on a day in the closure month. There are no holdings or revenue rows from the closure month-end onwards, and no transactions or interactions dated after `closed_date`. |
| Cash | Deposits and withdrawals always attach to the single Cash product ("Cash & Liquid Balance"). SIPs go into a fund; redemptions come out of a fund. |
| Switches | Always created as a pair: same client, date and amount, two different products, `switch_out` immediately followed by `switch_in`. |
| Base churn | One base monthly hazard, calibrated by bisection so annual attrition (KPI definitions) lands at 12%. Churn is only possible 4+ months after window tenure starts. |
| Contact-gap rule | Hazard x 3 when days since the last connected contact at the previous month-end is 90 or more. Segment multipliers: Mass Affluent 1.5, HNI 0.8, UHNI 0.5. |
| Churn types | 85% closed (account closed), 15% silent (account stays open, AUM falls below Rs 1,00,000, a small cash residual remains). |
| Advisor roles | 5 "star" advisors (inflow x1.6, contact x1.3) and 5 disjoint "poor contact" advisors (contact x0.3), chosen by the seeded RNG. |
| Dirty data | Injected only into `output/staging`, after the clean tables are saved. Every injected defect is listed in `output/truth/dirty_manifest.csv`. Defects are added as extra rows (copies), except null `kyc_status`, which edits the client row in place. |
| Dirty rates | transactions 2.6% (duplicate id 1.0, negative amount 0.8, orphan client 0.8); clients 2.5% null KYC; holdings 2.8% (orphan 1.4, negative value 1.4); interactions 2.8% orphan. Holdings and interactions rates were raised from the first draft (2.0%) because revenue, advisors and products carry no dirty rows and the overall share was 1.81%, below the 2.0-3.0% target. |
| Normal client allocation | 3-4 non-cash products, not 2-4. With only 2 non-cash products plus 2-12% cash, no single product can stay under 35%. Idle and concentrated clients may hold 2-4. |

## (b) How each behaviour is generated

**Market returns.** Each asset class gets a monthly return from a shared market factor plus class noise, using approximate annual mean and volatility (Equity 12%/16%, Debt 7%/3%, Hybrid 10%/9%, Gold 9%/12%, Alternatives 11%/10%, Cash 3.5%/0.1%). Each product adds small noise. Returns are clipped to +/-15%. There is one planted equity **correction in September and October 2025** (about -4.1% each month, roughly -8% over two months); the other asset classes receive a negative factor shock in those months. A NAV is kept per product per month and `units = round(market_value / NAV, 4)`; `market_value` is the source of truth.

**Allocation.** Each client holds Cash plus 3-4 non-cash products (2-4 for idle and concentrated profiles), chosen with probabilities that follow the risk profile (Conservative leans to Debt and Hybrid, Aggressive to Equity and Alternatives). Normal clients plan cash at 4-10% and no product above 32%. Idle-cash clients (8%) move to 40-52% cash for 4-10 consecutive months. Concentrated clients (6%) keep one non-cash product at 50-75%. When month-end weights drift outside a profile's band (cash 2.2-11.8% and product at most 34.5% for normal clients), corrective switch pairs move the portfolio back to target.

**Roll-forward.** `end_value = round((prev_value + net_flows_into_product) x (1 + product_return))`, exactly, for every client-product-month.

**New clients.** An initial deposit of `onboarding_aum` on the onboarding date into Cash, then switch pairs in the same month deploy it to the planned mix.

**SIPs.** About 25% of clients (28% Mass Affluent, 16% HNI, 8% UHNI; star advisors' clients are more likely) have one monthly SIP on a fixed day 1-28, starting the month after onboarding. Amounts: Rs 5,000-25,000 for Mass Affluent, up to Rs 1,00,000 for others, never above 10% of onboarding AUM.

**Top-ups.** Per client-month probability 3% / 5% / 6% (Mass Affluent / HNI / UHNI) multiplied by the advisor inflow factor; the amount is 5-25% of AUM, deposited into Cash and then deployed by switch pairs.

**Ordinary outflows and switches.** 1.5% per client-month for a withdrawal (from Cash) or fund redemption of 3-10% of AUM, never below Rs 1,25,000 AUM and never more than the available balance. 2% per client-month for a tactical switch pair of 10-30% of one product; it is dropped if it would breach the client's allocation band.

**Switch pairs.** Generated in the same step as their two legs, so they always balance and always sit on consecutive transaction IDs.

**Contacts.** Poisson contacts per client-month with base rates 0.6 / 1.0 / 1.6 (Mass Affluent / HNI / UHNI), times a global tuning scale (1.3), times the advisor's propensity (normal around 1.0, sd 0.2, times the star or poor-contact factor). Outcome 60% connected, 25% missed, 15% no response. Channel mix depends on segment. Contacts are generated before churn and are only ever removed if they would fall after a `closed_date`.

**Churn.** Simulated month by month from the contact gaps. Hazard = base x segment multiplier x 3 if gap >= 90 days. For closed churners, the 3 months before the churn month have pro-rata redemptions and withdrawals of 15-35% of AUM each month (capped so the client is still "active" under the KPI definition in the month before leaving), SIPs and top-ups stop, and in the churn month the whole balance is redeemed on one day and the account is closed.

**Silent churn.** Same pre-churn outflows, but in the churn month everything except a small cash residual (Rs 8,000-70,000) is redeemed. The account stays open with AUM below Rs 1,00,000 and `closed_date` NULL, and the residual only moves with the Cash return afterwards.

**Revenue.** One row per client per month-end that has holdings: `round(sum(market_value x fee_pct / 100 / 12))`, whole rupees.

## (c) Hidden truth files

All live in `data_generation/output/truth/` and are git-ignored.

| File | Content | Later use |
|---|---|---|
| `dirty_manifest.csv` | Every injected defect: table, key value, defect type, detail | The answer key. When the data quality checks run on staging, the set of rows they flag is compared to this manifest; the target is 100% of planted defects caught with no false positives. After removing flagged rows, staging must equal `output/clean` exactly. |
| `churn_truth.csv` | Per client: churn type (closed / silent / none), churn month, base hazard, effective hazard, closed date | Proves the attrition KPI and churn flags recover the planted churners. |
| `advisor_roles.csv` | Star / poor-contact / normal, inflow factor, contact propensity | Checks that advisor-level analysis finds the planted advisors. |
| `client_profiles.csv` | Idle-cash / concentrated / normal per client | Checks that the idle-cash and concentration flags find the planted clients. |
| `market_returns.csv` | Monthly return and NAV per product | Used by the clean-data check and available to the reconciliation checks. |

## (d) How to regenerate

```
python data_generation/generate.py                 # full size, seed 42, about 10 seconds
python data_generation/generate.py --small         # 300 clients
python data_generation/generate.py --seed 7        # different but reproducible data
python data_generation/check_clean_data.py         # 56 mart-rule checks on output/clean
python data_generation/validate_patterns.py        # writes docs/pattern_validation.md
python data_generation/load_staging.py --dry-run   # counts and size estimate, no connection
python data_generation/load_staging.py             # load (refuses if staging is not empty)
python data_generation/load_staging.py --truncate-staging   # replace staging; asks you to type "TRUNCATE staging"
```

The same seed gives byte-identical CSVs (every file's SHA256 is recorded in `output/run_summary.json`). Each part of the generator has its own random stream derived from the seed, so changing one parameter does not reshuffle unrelated parts. For example, changing the dirty-data rates leaves the clean CSVs identical.

## (e) Known simplifications

- **Synthetic returns, not real NAVs.** Returns come from a factor model; there are no real fund prices.
- **Roll-forward approximation.** All flows of a month are treated as happening at the start of the month, so a mid-month deposit still earns the full month's return.
- **Opening balances.** Clients onboarded before the window (85%) start with `onboarding_aum x U(0.9, 1.6)` at the first snapshot, spread over their planned mix. Their history before the window does not exist.
- **No transactions before the window**, and none in January 2025 for pre-window clients: January holdings are just the opening balances.
- **Interactions before the window** exist only for the 6 months before it.
- **Churn is decided before holdings are simulated**, from contact gaps only; a few clients are counted by the KPI definition in a different month than the truth file plans.
- **January 2025 joiners have no data.** The 34 clients onboarded in January 2025 have no holdings, transactions or revenue (no transactions are generated in January 2025), so they are never active. This contradicts the "every new client is active at their first month-end" limitation in the KPI dictionary for that month only. The cohort retention view excludes that cohort; every other KPI treats them as inactive.
- **Staging size is an estimate** (CSV bytes plus row overhead); the loader prints real sizes after loading.

## (f) Resolved KPI questions

These questions came up while building the generator. Each is now settled in `docs/kpi_dictionary.md`, and the generator and validator follow the decisions.

| Question | Decision | Recorded in docs/kpi_dictionary.md |
|---|---|---|
| When does AUM become 0 for a closed client? | Closed clients have no holdings rows from the closure month-end onward, so AUM is 0 from the closure month-end. | KPIs table, AUM row |
| What is "revenue lost" for a client with no revenue row in their closing month? | Their fee revenue in the last month-end before churn, reported in the churn month. | KPIs table, Revenue per Client row |
| Does Concentration % count the Cash product? | No. It uses the largest single non-cash product divided by AUM (AUM still includes cash); a cash-only client has NULL concentration. | KPIs table, Concentration % row; worked example; Ambiguities item 1 |
| How is attrition annualised? | The monthly definition is kept, plus a second line: trailing 12-month attrition = clients churned in the last 12 months / clients active 12 months ago. The validator's annual figure is annualised from the monthly rate. | KPIs table, Attrition Rate row |
| Which segment do exactly Rs 25 lakh and Rs 5 crore belong to? | HNI, matching the mart CHECK. | Global definitions, Segment row; Ambiguities item 3 |
| Can a churned client return? | Returning clients are not simulated. | Known limitations |
| What is the smallest onboarding AUM? | Rs 1.5 lakh, so every new client is active at their first month-end. | Known limitations |

## (g) Sanity queries to run by hand in DBeaver

```sql
-- 1. Row counts per staging table
SELECT 'advisors' AS tbl, count(*) FROM staging.advisors
UNION ALL SELECT 'clients', count(*) FROM staging.clients
UNION ALL SELECT 'products', count(*) FROM staging.products
UNION ALL SELECT 'transactions', count(*) FROM staging.transactions
UNION ALL SELECT 'holdings_monthly', count(*) FROM staging.holdings_monthly
UNION ALL SELECT 'interactions', count(*) FROM staging.interactions
UNION ALL SELECT 'revenue', count(*) FROM staging.revenue;

-- 2. Duplicate txn_ids (compare with duplicate_txn_id in dirty_manifest.csv)
SELECT txn_id, count(*) AS copies
FROM staging.transactions
GROUP BY txn_id
HAVING count(*) > 1
ORDER BY txn_id
LIMIT 20;

-- 3. Negative amounts (compare with negative_amount in dirty_manifest.csv)
SELECT count(*) AS negative_amounts, min(amount) AS most_negative
FROM staging.transactions
WHERE amount < 0;

-- 4. Date range of transactions (expect inside Jan 2025 - Oct 2026)
SELECT min(txn_date) AS first_txn, max(txn_date) AS last_txn
FROM staging.transactions;
```
