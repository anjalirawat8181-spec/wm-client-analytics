# Data Design Notes

> **Note:** Holdings are **monthly snapshots** (`fact_holdings_monthly`, ~480K rows), not daily, to stay within Neon's 0.5 GB free tier.

## Patterns planted in the synthetic data

1. **Contact gap drives churn:** clients with no advisor contact for 90+ days churn at ~3x the base rate.
2. **Segment effect:** Mass Affluent clients churn more than HNI and UHNI.
3. **Pre-churn outflows:** churners show net outflows in the 3 months before leaving.
4. **Advisor variation:** a couple of advisors have high AUM growth; a couple have poor contact frequency.
5. **Dirty data:** ~2-3% of records are dirty:
   - duplicate transactions
   - null KYC fields
   - orphaned client IDs
   - negative amounts
