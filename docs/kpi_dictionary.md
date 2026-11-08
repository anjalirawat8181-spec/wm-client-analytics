# KPI Dictionary

## Global definitions

| Term | Rule |
|---|---|
| Snapshot date | Last calendar day of each month |
| Currency | INR, stored as whole rupees |
| Active client | Account status = open AND AUM >= 100000 at the snapshot date |
| Churned client | Active at the previous month-end, AND either closed during the month OR AUM < 100000 at this month-end |
| Segment | Mass Affluent < 25 lakh, HNI 25 lakh to 5 crore, UHNI > 5 crore. Fixed at onboarding, never recalculated. Exactly Rs 25 lakh and Rs 5 crore fall in HNI |
| Clean data only | KPIs use only records that pass data quality checks (no duplicates, no negative amounts, no orphaned client IDs) |

The single threshold of 100000 (Rs 1 lakh) is used for both "active" and "churned" everywhere in this file.

## KPIs

| KPI | Definition | Formula | Grain | Source table | Edge cases/rules |
|---|---|---|---|---|---|
| AUM | Total market value of client assets at month-end | `SUM(market_value)` | client x month | `fact_holdings_monthly` | - Sum of market_value across all products, including cash, at the snapshot date<br>- Closed clients have no holdings rows from the closure month-end onward; AUM is treated as 0 from the closure month-end<br>- Negative market values are treated as dirty data, excluded, and logged<br>- Stored in rupees, reported in Rs crore on the dashboard |
| Net New Money | Inflows minus outflows, excluding market movement | `SUM(inflows) - SUM(outflows)` | client x month | `fact_transactions` | - Counts only external flows: deposits and SIP contributions in; withdrawals and redemptions paid out<br>- Uses `fact_transactions.flow_type`: include `external_in` and `external_out`; exclude `internal` (switches between products)<br>- Excludes market gains or losses<br>- Dated by transaction date and assigned to that calendar month<br>- Can be negative; that is meaningful, not an error |
| Attrition Rate | Share of opening clients who churned in the month | `churned_clients / opening_clients` | month x segment | `dim_client` + `fact_holdings_monthly` | - Denominator = clients active at the previous month-end<br>- Numerator = those same clients who meet the churned definition<br>- Clients who joined during the month are excluded from both numerator and denominator<br>- A client who returns later counts as churned in the month they left and as a new client when they return<br>- If the denominator = 0 for a segment, the value is NULL<br>- Trailing 12-month attrition = clients churned in the last 12 months / clients active 12 months ago<br>- The validator's annual figure is annualised from the monthly rate: 1 - (1 - monthly rate)^12 |
| Revenue per Client | Average fee revenue per active client | `SUM(fee_revenue) / COUNT(active clients)` | month x segment | `fact_revenue` | - Numerator = fee revenue booked in the month for clients active at month-end<br>- Denominator = count of those same clients<br>- Revenue from clients who churned that month is excluded here and reported separately as "revenue lost"<br>- Revenue lost for a churned client = their fee revenue in the last month-end before churn, reported in the churn month<br>- Monthly figure, not annualised<br>- If active client count = 0, the value is NULL |
| Idle Cash % | Share of a client's assets held in cash | `cash_value / AUM` | client x month | `fact_holdings_monthly` + `dim_product` | - cash_value / AUM, where cash = products with `asset_class = 'Cash'`<br>- A client is flagged "idle" if the value is above 30% for 2 or more consecutive months<br>- Exclude clients with AUM < 100000<br>- If AUM = 0, the value is NULL, not 0 |
| Concentration % | Share of a client's assets in their largest non-cash product | `MAX(non_cash_product_value) / AUM` | client x month | `fact_holdings_monthly` | - Largest single non-cash product value (products with `asset_class <> 'Cash'`) divided by AUM at the snapshot date; AUM still includes cash<br>- Measured at product level, not asset class<br>- A client is flagged "concentrated" above 40%<br>- Exclude inactive clients; a client with one non-cash holding and no cash is 100%, which is valid<br>- A client holding only cash has NULL concentration |
| Days Since Last Contact | Days elapsed since the client's most recent advisor interaction | `snapshot_date - MAX(interaction_date)` | client | `fact_interactions` | - Snapshot date minus the date of the latest interaction on or before the snapshot date<br>- Only interactions with `outcome = 'connected'` count; missed calls and unanswered emails do not<br>- If a client has never been contacted, use days since onboarding date<br>- Flags: "at risk" at 90+ days, "critical" at 180+ days |

## Decisions made

1. **Active client:** account status = open AND AUM >= 100000 (Rs 1 lakh) at the snapshot date.
2. **Churned client:** active at the previous month-end, AND either closed during the month OR AUM < 100000 (Rs 1 lakh) at this month-end.

These values are my own choices because the data is fictional. Any change must be applied consistently across this whole file and all later SQL.

## Worked example: one imaginary client

Snapshot used: **30 September 2026**.

| Figure | Value |
|---|---|
| Onboarded | March 2026, with Rs 8 lakh (800000) |
| Segment | Mass Affluent (< 25 lakh), fixed at onboarding |
| Connected interactions | 12 April 2026, 20 June 2026 |
| Withdrawal | Rs 6 lakh (600000) in September 2026, `flow_type = external_out` |
| AUM, 31 Aug 2026 | Rs 8.4 lakh (840000) |
| AUM, 30 Sep 2026 | Rs 2.4 lakh (240000) |
| Cash share of AUM | 40% in both August and September |

| KPI | Value at 30 Sep 2026 | Rule that produced it |
|---|---|---|
| AUM | Rs 2,40,000 (Rs 0.024 crore on the dashboard) | Sum of market_value across all products including cash; client is still open, so no zero-AUM rule applies |
| Net New Money | -Rs 6,00,000 for September | Withdrawal is `external_out`, so it counts; dated in September; negative value is meaningful. The March onboarding deposit falls in March, not September |
| Attrition Rate | Not a client-level value; this client contributes **0 churned** and **1 to the denominator** for Mass Affluent in September | Client was active at 31 Aug (open, 840000 >= 100000), so they are in the denominator |
| Revenue per Client | Not a client-level value; this client counts in the Mass Affluent denominator for September | Client is active at month-end (open, 240000 >= 100000), so their September fee revenue is included and they are counted. No revenue figure was supplied, so no number can be given |
| Idle Cash % | 40%, flagged **idle** | cash_value / AUM = 0.40; above 30% in August and September (2 consecutive months). AUM 240000 >= 100000, so not excluded |
| Concentration % | Not determinable; at most 60% | Cash (40% of AUM) is excluded, so the largest non-cash product is at most 60% of AUM. The product breakdown is not given, so the exact value and the flag (above 40%) cannot be computed. See ambiguities |
| Days Since Last Contact | 102 days, flagged **at risk** | 30 Sep minus last connected interaction 20 June (10 + 31 + 31 + 30 = 102). 102 >= 90, but < 180, so not critical |

### Churn status in September 2026

The client is **NOT churned** in September. They were active at 31 August (open, AUM Rs 8.4 lakh >= Rs 1 lakh). At 30 September the account is still open and AUM of Rs 2.4 lakh is still above the Rs 1 lakh threshold, so neither churn condition is met. They remain active and stay in the opening client base for October.

### Ambiguities found

1. **Concentration % cannot be fully computed.** The product breakdown is not given. Cash is excluded from the rule, so concentration is at most 60% here, and the "concentrated" flag (above 40%) depends on whether the largest non-cash product exceeds 40% of AUM.
2. **Revenue per Client has no figure for this client.** No fee revenue was supplied, so only the inclusion rule can be shown.
3. **Segment basis is unstated.** The rule says segment is fixed at onboarding but not which measure is compared with the bands. This example assumes the Rs 8 lakh onboarding amount. Boundary values are settled in the Global definitions: exactly Rs 25 lakh and Rs 5 crore fall in HNI.
4. **Idle flag history is partly unknown.** Only August and September cash shares are given. The flag is met on those two months alone, but whether the flag is first raised in August or September (it needs 2 consecutive months) is not specified.
5. **Withdrawal vs AUM drop.** AUM falls by exactly Rs 6 lakh (8.4 to 2.4), matching the withdrawal, which implies zero market movement and no other flows in September. This is assumed, not stated.
6. **AUM between March and August is not given.** The client's activity status in those months (and whether they were ever near the threshold) is assumed to be active throughout.

## Schema notes for Step 2

- `fact_transactions` needs a `flow_type` column with allowed values: `external_in`, `external_out`, `internal`.
- `fact_holdings_monthly` is month-end snapshots (not daily).
- `dim_product` needs an `asset_class` column that includes a `'Cash'` value.
- `fact_interactions` needs an `outcome` column that includes a `'connected'` value.
- `dim_client` needs account status, onboarding date, and segment columns.

## Known limitations

- Returning clients are not simulated: a client who churns never comes back as a new client in the generated data.
- Minimum onboarding AUM is Rs 1.5 lakh, so every new client is active at their first month-end.
