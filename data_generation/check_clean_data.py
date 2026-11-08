"""Check that output/clean/*.csv satisfies every mart rule (pure pandas, no database).

Usage: python data_generation/check_clean_data.py   (exit code 0 = all passed)
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import config as C

CLEAN = HERE / "output" / "clean"
TRUTH = HERE / "output" / "truth"
results = []


def check(name, ok, detail=""):
    ok = bool(ok)
    results.append((name, ok))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail and not ok else ""))


def load(name):
    return pd.read_csv(CLEAN / f"{name}.csv")


def main():
    if not CLEAN.exists():
        print("output/clean not found - run generate.py first")
        return 2
    adv, cli, prd = load("advisors"), load("clients"), load("products")
    txn, hold, inter, rev = load("transactions"), load("holdings_monthly"), load("interactions"), load("revenue")
    mkt = pd.read_csv(TRUTH / "market_returns.csv")
    dmin, dmax = pd.Timestamp(C.DIM_DATE_MIN), pd.Timestamp(C.DIM_DATE_MAX)

    check("PK advisors.advisor_id unique", adv.advisor_id.is_unique)
    check("PK clients.client_id unique", cli.client_id.is_unique)
    check("PK products.product_id unique", prd.product_id.is_unique)
    check("PK transactions.txn_id unique", txn.txn_id.is_unique)
    check("PK holdings (client, product, snapshot) unique", not hold.duplicated(["client_id", "product_id", "snapshot_date"]).any())
    check("PK interactions.interaction_id unique", inter.interaction_id.is_unique)
    check("PK revenue (client, month_end) unique", not rev.duplicated(["client_id", "month_end"]).any())
    check("product_name unique", prd.product_name.is_unique)
    check("ID ranges (advisors, products, clients, txn, interaction)",
          adv.advisor_id.min() == C.ADVISOR_ID_START and prd.product_id.min() == C.PRODUCT_ID_START
          and cli.client_id.min() == C.CLIENT_ID_START and txn.txn_id.min() == C.TXN_ID_START
          and inter.interaction_id.min() == C.INTERACTION_ID_START)

    check("FK clients.advisor_id -> advisors", cli.advisor_id.isin(adv.advisor_id).all())
    check("FK transactions.client_id -> clients", txn.client_id.isin(cli.client_id).all())
    check("FK transactions.product_id -> products", txn.product_id.isin(prd.product_id).all())
    check("FK holdings.client_id -> clients", hold.client_id.isin(cli.client_id).all())
    check("FK holdings.product_id -> products", hold.product_id.isin(prd.product_id).all())
    check("FK interactions.client_id -> clients", inter.client_id.isin(cli.client_id).all())
    check("FK interactions.advisor_id -> advisors", inter.advisor_id.isin(adv.advisor_id).all())
    check("FK revenue.client_id -> clients", rev.client_id.isin(cli.client_id).all())
    adv_of = cli.set_index("client_id").advisor_id
    check("interactions use the client's own advisor", (inter.advisor_id.values == adv_of.loc[inter.client_id].values).all())

    a = cli.onboarding_aum
    band = (((cli.segment == "Mass Affluent") & (a < 2_500_000))
            | ((cli.segment == "HNI") & a.between(2_500_000, 50_000_000))
            | ((cli.segment == "UHNI") & (a > 50_000_000)))
    check("segment matches onboarding_aum band", band.all())
    check("onboarding_aum >= 0, whole rupees", (a >= 0).all() and a.dtype.kind == "i")
    closed = cli.account_status == "closed"
    check("closed_date present exactly when closed", (closed == cli.closed_date.notna()).all())
    check("closed_date >= onboarding_date",
          (pd.to_datetime(cli.closed_date[closed]) >= pd.to_datetime(cli.onboarding_date[closed])).all())
    check("account_status in {open, closed}", cli.account_status.isin(["open", "closed"]).all())
    check("risk_profile in allowed set", cli.risk_profile.isin(["Conservative", "Moderate", "Aggressive"]).all())
    check("kyc_status in allowed set (no nulls)", cli.kyc_status.isin(["verified", "pending", "expired"]).all())
    check("no null in client mandatory columns", cli.drop(columns="closed_date").notna().all().all())
    check("advisor columns not null", adv.notna().all().all())

    check("asset_class in allowed set", prd.asset_class.isin(["Equity", "Debt", "Hybrid", "Gold", "Cash", "Alternatives"]).all())
    check("exactly one Cash product", (prd.asset_class == "Cash").sum() == 1)
    check("fee_pct between 0 and 5", prd.fee_pct.between(0, 5).all())

    flow_ok = (((txn.txn_type.isin(["deposit", "sip"])) & (txn.flow_type == "external_in"))
               | ((txn.txn_type.isin(["withdrawal", "redemption"])) & (txn.flow_type == "external_out"))
               | ((txn.txn_type.isin(["switch_in", "switch_out"])) & (txn.flow_type == "internal")))
    check("txn_type / flow_type consistent", flow_ok.all())
    check("amount > 0 and whole rupees", (txn.amount > 0).all() and txn.amount.dtype.kind == "i")
    cash_id = int(prd.loc[prd.asset_class == "Cash", "product_id"].iloc[0])
    dw = txn[txn.txn_type.isin(["deposit", "withdrawal"])]
    check("deposits/withdrawals attach to Cash", (dw.product_id == cash_id).all())
    t = txn.sort_values("txn_id").reset_index(drop=True)
    so = t.index[t.txn_type == "switch_out"]
    nxt = t.loc[so + 1] if (so + 1).max() < len(t) else None
    ok = nxt is not None and (nxt.txn_type.values == "switch_in").all() \
        and (nxt.client_id.values == t.loc[so, "client_id"].values).all() \
        and (nxt.txn_date.values == t.loc[so, "txn_date"].values).all() \
        and (nxt.amount.values == t.loc[so, "amount"].values).all() \
        and (nxt.product_id.values != t.loc[so, "product_id"].values).all()
    check("switch pairs balance (same client/date/amount, different products)", ok and (t.txn_type == "switch_in").sum() == len(so))
    td = pd.to_datetime(txn.txn_date)
    check("transaction dates inside dim_date range", td.between(dmin, dmax).all())
    check("no transaction dated before the window", (td >= pd.Timestamp(C.FIRST_MONTH_END).replace(day=1)).all())

    sd = pd.to_datetime(hold.snapshot_date)
    check("snapshot_date is a month-end", (sd == sd + pd.offsets.MonthEnd(0)).all())
    check("snapshot_date inside 2024-01-01..2027-12-31", sd.between(dmin, dmax).all())
    check("units >= 0 and market_value >= 0 (int)", (hold.units >= 0).all() and (hold.market_value >= 0).all() and hold.market_value.dtype.kind == "i")
    check("holdings rows have value > 0", (hold.market_value > 0).all())
    me = pd.to_datetime(rev.month_end)
    check("revenue month_end is a month-end inside range", (me == me + pd.offsets.MonthEnd(0)).all() and me.between(dmin, dmax).all())
    check("fee_revenue >= 0", (rev.fee_revenue >= 0).all())
    h = hold.merge(prd[["product_id", "fee_pct"]], on="product_id")
    h["fee"] = h.market_value * h.fee_pct / 100 / 12
    exp = h.groupby(["client_id", "snapshot_date"]).fee.sum().round().astype("int64").rename("exp").reset_index()
    j = rev.merge(exp, left_on=["client_id", "month_end"], right_on=["client_id", "snapshot_date"], how="outer", indicator=True)
    check("revenue = round(sum(mv x fee_pct/100/12)) and one row per client with holdings",
          (j._merge == "both").all() and (j.fee_revenue == j.exp).all())

    idt = pd.to_datetime(inter.interaction_date)
    check("interaction dates inside dim_date range", idt.between(dmin, dmax).all())
    check("channel in allowed set", inter.channel.isin(["call", "email", "meeting", "whatsapp"]).all())
    check("outcome in allowed set", inter.outcome.isin(["connected", "missed", "no_response"]).all())
    check("interaction not before onboarding",
          (idt.values >= pd.to_datetime(cli.set_index("client_id").onboarding_date.loc[inter.client_id]).values).all())

    cd = pd.to_datetime(cli.set_index("client_id").closed_date)
    cd_t = cd.reindex(txn.client_id).values
    cd_i = cd.reindex(inter.client_id).values
    cd_h = cd.reindex(hold.client_id).values
    cd_r = cd.reindex(rev.client_id).values
    check("no transaction after closed_date", ~((td.values > cd_t) & ~pd.isna(cd_t)).any())
    check("no interaction after closed_date", ~((idt.values > cd_i) & ~pd.isna(cd_i)).any())
    check("no holdings row from the closure month-end onwards",
          ~((sd.values >= (pd.to_datetime(cd_h) + pd.offsets.MonthEnd(0)).values) & ~pd.isna(cd_h)).any())
    check("no revenue row from the closure month-end onwards",
          ~((me.values >= (pd.to_datetime(cd_r) + pd.offsets.MonthEnd(0)).values) & ~pd.isna(cd_r)).any())
    ob = pd.to_datetime(cli.set_index("client_id").onboarding_date)
    first_snap = pd.Timestamp(C.FIRST_MONTH_END)
    check("no holdings before the onboarding month-end",
          (sd.values >= (ob.reindex(hold.client_id) + pd.offsets.MonthEnd(0)).values).all())

    sign = txn.txn_type.map({"deposit": 1, "sip": 1, "switch_in": 1, "withdrawal": -1, "redemption": -1, "switch_out": -1})
    fl = pd.DataFrame({"client_id": txn.client_id, "product_id": txn.product_id,
                       "snapshot_date": (td + pd.offsets.MonthEnd(0)).dt.strftime("%Y-%m-%d"),
                       "net": txn.amount * sign}).groupby(["client_id", "product_id", "snapshot_date"]).net.sum().reset_index()
    hs = hold[["client_id", "product_id", "snapshot_date", "market_value"]].copy()
    prev = hs.copy()
    prev["snapshot_date"] = (pd.to_datetime(prev.snapshot_date) + pd.offsets.MonthEnd(1)).dt.strftime("%Y-%m-%d")
    prev = prev.rename(columns={"market_value": "prev"})
    r = hs.merge(prev, on=["client_id", "product_id", "snapshot_date"], how="left")
    r = r.merge(fl, on=["client_id", "product_id", "snapshot_date"], how="left")
    r["net"] = r.net.fillna(0)
    r = r.merge(mkt.rename(columns={"month_end": "snapshot_date"})[["product_id", "snapshot_date", "monthly_return"]],
                on=["product_id", "snapshot_date"], how="left")
    has_prev = r.prev.notna()
    rp = r[has_prev]
    expect = np.rint((rp.prev + rp.net) * (1 + rp.monthly_return))
    share = (np.abs(rp.market_value - expect) <= 1).mean()
    check(f"roll-forward identity holds (>= 99.99% of {len(rp):,} rows; got {share:.4%})", share >= 0.9999)
    check("balances never negative before returns (prev + net >= 0)", ((rp.prev + rp.net) >= 0).all())
    newrows = r[~has_prev & (r.snapshot_date != first_snap.strftime("%Y-%m-%d"))]
    check("a new holding row (no prior month) always has an inflow that month", (newrows.net > 0).all())

    check("all seven tables non-empty", all(len(x) > 0 for x in (adv, cli, prd, txn, hold, inter, rev)))

    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
