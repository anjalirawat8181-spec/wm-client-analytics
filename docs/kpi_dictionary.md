# KPI Dictionary

| KPI | Definition | Formula | Grain | Source table | Edge cases/rules |
|---|---|---|---|---|---|
| AUM | Total market value of client assets at month-end | `SUM(market_value)` | client x month | `fact_holdings_monthly` | TODO (owner: me) |
| Net New Money | Inflows minus outflows, excluding market movement | `SUM(inflows) - SUM(outflows)` | client x month | `fact_transactions` | TODO (owner: me) |
| Attrition Rate | Share of opening clients who churned in the month | `churned_clients / opening_clients` | month x segment | `dim_client` + `fact_holdings_monthly` | TODO (owner: me) |
| Revenue per Client | Average fee revenue per active client | `SUM(fee_revenue) / COUNT(active clients)` | month x segment | `fact_revenue` | TODO (owner: me) |
| Idle Cash % | Share of a client's assets held in cash | `cash_value / AUM` | client x month | `fact_holdings_monthly` + `dim_product` | TODO (owner: me) |
| Concentration % | Share of a client's assets in their largest product | `MAX(product_value) / AUM` | client x month | `fact_holdings_monthly` | TODO (owner: me) |
| Days Since Last Contact | Days elapsed since the client's most recent advisor interaction | `snapshot_date - MAX(interaction_date)` | client | `fact_interactions` | TODO (owner: me) |

## Open decisions (must be made before writing SQL)

1. **What counts as an "active" client?** Needed for Revenue per Client (denominator) and Attrition Rate (opening clients). For example: AUM > 0 at month-end, or at least one transaction/interaction in the period.
2. **What AUM threshold counts as churned?** For example: AUM falls to zero, or below a small amount (or a percentage of prior peak) for N consecutive months.
