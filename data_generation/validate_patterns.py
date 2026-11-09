import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"
DOC = HERE.parent / "docs" / "pattern_validation.md"
THRESH = 100_000
rows = []

def add(metric, measured, target, ok, meaning, fix=""):
    rows.append((metric, measured, target, bool(ok), meaning, fix))

def rd(sub, name):
    return pd.read_csv(OUT / sub / f"{name}.csv")

def main():
    cli, hold, prd = rd("clean", "clients"), rd("clean", "holdings_monthly"), rd("clean", "products")
    txn, inter = rd("clean", "transactions"), rd("clean", "interactions")
    roles, mkt = rd("truth", "advisor_roles"), rd("truth", "market_returns")
    ME = sorted(hold.snapshot_date.unique())
    M = len(ME)
    mi = {d: i for i, d in enumerate(ME)}
    N = len(cli)
    ci = {c: i for i, c in enumerate(cli.client_id.values)}
    hold["m"] = hold.snapshot_date.map(mi)
    hold["i"] = hold.client_id.map(ci)
    AUM = np.zeros((N, M))
    np.add.at(AUM, (hold.i.values, hold.m.values), hold.market_value.values)
    active = AUM >= THRESH
    cd = pd.to_datetime(cli.closed_date)
    closed_m = np.full(N, -1)
    for k, d in enumerate(cd):
        if pd.notna(d):
            closed_m[k] = mi[(d + pd.offsets.MonthEnd(0)).strftime("%Y-%m-%d")]
    churn = np.zeros((N, M), bool)
    for m in range(1, M):
        churn[:, m] = active[:, m - 1] & ((closed_m == m) | (AUM[:, m] < THRESH))
    op, ch = active[:, :-1], churn[:, 1:]
    seg = cli.segment.values
    segs = ["Mass Affluent", "HNI", "UHNI"]

    att = 1 - (1 - ch.sum() / op.sum()) ** 12
    add("1. Overall annual attrition", f"{att:.2%}", "10% - 14%", 0.10 <= att <= 0.14,
        "About this share of opening clients is lost per year.", "TARGET_ANNUAL_CHURN")

    conn = inter[inter.outcome == "connected"]
    cc = conn.client_id.map(ci).values
    cdt = pd.to_datetime(conn.interaction_date).values.astype("datetime64[D]").astype("int64")
    onb = pd.to_datetime(cli.onboarding_date).values.astype("datetime64[D]").astype("int64")
    gap = np.zeros((N, M))
    for m in range(M):
        me = np.datetime64(ME[m]).astype("datetime64[D]").astype("int64")
        last = onb.copy()
        sel = cdt <= me
        np.maximum.at(last, cc[sel], cdt[sel])
        gap[:, m] = me - last
    g = gap[:, :-1] >= 90
    share = g[op].mean()
    add("2. Client-months with 90+ days since last connected contact", f"{share:.1%}", "15% - 30%", 0.15 <= share <= 0.30,
        "Roughly this share of active client-months is 'at risk' for lack of advisor contact.", "CONTACT_RATE_SCALE")

    raw = ch[op & g].mean() / ch[op & ~g].mean()
    num = den = 0.0
    for s in segs:
        mk = (seg == s)[:, None]
        ng, nn = (op & g & mk).sum(), (op & ~g & mk).sum()
        eg, en = ch[op & g & mk].sum(), ch[op & ~g & mk].sum()
        num += eg * nn / (ng + nn)
        den += en * ng / (ng + nn)
    strat = num / den
    add("3a. Churn-rate ratio, 90+ day gap vs under 90 (raw)", f"{raw:.2f}x", "2.5 - 3.5", 2.5 <= raw <= 3.5,
        "Clients not contacted for 90+ days leave this many times faster.", "CONTACT_GAP_MULTIPLIER")
    add("3b. Same ratio, stratified by segment (Mantel-Haenszel)", f"{strat:.2f}x", "2.4 - 3.6", 2.4 <= strat <= 3.6,
        "The contact effect holds after removing the segment mix.", "CONTACT_GAP_MULTIPLIER")

    ann = {s: 1 - (1 - ch[seg == s].sum() / op[seg == s].sum()) ** 12 for s in segs}
    r_h, r_u = ann["Mass Affluent"] / ann["HNI"], ann["Mass Affluent"] / ann["UHNI"]
    add("4a. Annual churn, Mass Affluent / HNI", f"{r_h:.2f}x (MA {ann['Mass Affluent']:.1%}, HNI {ann['HNI']:.1%})", ">= 1.5",
        r_h >= 1.5, "Mass Affluent clients churn this many times as often as HNI.", "SEGMENT_HAZARD_MULTIPLIER (Mass Affluent up or HNI down)")
    add("4b. Annual churn, Mass Affluent / UHNI", f"{r_u:.2f}x (UHNI {ann['UHNI']:.1%})", ">= 2.0",
        r_u >= 2.0, "Mass Affluent clients churn this many times as often as UHNI.", "SEGMENT_HAZARD_MULTIPLIER (UHNI down)")

    txn["me"] = (pd.to_datetime(txn.txn_date) + pd.offsets.MonthEnd(0)).dt.strftime("%Y-%m-%d")
    txn["m"] = txn.me.map(mi)
    txn["i"] = txn.client_id.map(ci)
    txn["net"] = txn.amount * txn.flow_type.map({"external_in": 1, "external_out": -1, "internal": 0})
    NNM = np.zeros((N, M))
    np.add.at(NNM, (txn.i.values, txn.m.values), txn.net.values)

    onb_m = np.array([mi.get((pd.Timestamp(d) + pd.offsets.MonthEnd(0)).strftime("%Y-%m-%d"), 0) for d in cli.onboarding_date])
    cl = np.nonzero((closed_m >= 4) & (closed_m - onb_m >= 4))[0]
    s3 = np.array([NNM[i, closed_m[i] - 3:closed_m[i]].sum() for i in cl])
    neg = (s3 < 0).mean()
    add("5a. Closed churners (4+ months tenure) with negative 3-month net new money before churn",
        f"{neg:.1%} of {len(cl):,}", ">= 90%", neg >= 0.90,
        "Nearly all leavers pull money out in the 3 months before closing - an early-warning signal.", "PRE_CHURN_OUTFLOW_PCT")
    pre_pct = [NNM[i, closed_m[i] - 3:closed_m[i]].sum() / AUM[i, closed_m[i] - 4] for i in cl if AUM[i, closed_m[i] - 4] > 0]
    ever = (closed_m >= 0) | churn.any(1)
    vals = []
    for i in np.nonzero(~ever)[0]:
        for m in range(4, M):
            if AUM[i, m - 4] >= THRESH:
                vals.append(NNM[i, m - 3:m].sum() / AUM[i, m - 4])
    med_c, med_n = np.median(pre_pct) * 100, np.median(vals) * 100
    add("5b. Median 3-month NNM as % of AUM: churners vs non-churners", f"{med_c:.1f}% vs {med_n:.1f}%", "churners negative, non-churners higher",
        med_c < 0 and med_c < med_n,
        "Leavers drain about this share of their assets in the run-up; stayers do not.", "PRE_CHURN_OUTFLOW_PCT")

    adv = cli.advisor_id.values
    opening = np.hstack([np.zeros((N, 1)), AUM[:, :-1]])
    has = opening > 0
    cm = pd.DataFrame({"adv": np.repeat(adv, M)[has.ravel()], "nnm": NNM.ravel()[has.ravel()], "open": opening.ravel()[has.ravel()]})
    rate = (cm.groupby("adv").nnm.sum() / cm.groupby("adv").open.sum())
    med = rate.median()
    star = roles[roles.role == "star"].advisor_id
    sr = rate.loc[star] / med
    add("6a. Star advisors' NNM / opening AUM vs all-advisor median (lowest of 5)", f"{sr.min():.2f}x (median advisor {med:.2%} per client-month)", ">= 1.3x each",
        (sr >= 1.3).all(), "Star advisors attract clearly more new money per rupee of client assets.", "STAR_INFLOW_FACTOR")
    inw = inter[(inter.outcome == "connected") & (inter.interaction_date >= ME[0][:8] + "01")]
    cmths = pd.Series((AUM > 0).sum(1)).groupby(adv).sum()
    cr = inw.groupby("advisor_id").size().reindex(cmths.index, fill_value=0) / cmths
    pr = cr.loc[roles[roles.role == "poor_contact"].advisor_id] / cr.median()
    add("6b. Poor-contact advisors' connected contacts per client-month vs median (highest of 5)", f"{pr.max():.2f}x", "<= 0.50x each",
        (pr <= 0.5).all(), "These advisors reach their clients less than half as often as a typical advisor.", "POOR_CONTACT_FACTOR")

    h = hold.merge(prd[["product_id", "asset_class"]], on="product_id")
    cash = np.zeros((N, M))
    c_ = h[h.asset_class == "Cash"]
    np.add.at(cash, (c_.i.values, c_.m.values), c_.market_value.values)
    mx = np.zeros((N, M))
    t = h[h.asset_class != "Cash"].groupby(["i", "m"]).market_value.max().reset_index()
    mx[t.i.values, t.m.values] = t.market_value.values
    with np.errstate(all="ignore"):
        cs, cc_ = np.where(AUM > 0, cash / AUM, 0), np.where(AUM > 0, mx / AUM, 0)
    idle = (cs > 0.30) & (AUM >= THRESH)
    idle_f = (idle[:, 1:] & idle[:, :-1]).any(1)
    conc_f = ((cc_ > 0.40) & active).any(1)
    add("7a. Clients ever flagged idle (cash > 30% for 2+ month-ends)", f"{idle_f.mean():.1%} ({idle_f.sum():,} clients)", "6% - 12%",
        0.06 <= idle_f.mean() <= 0.12, "These clients hold uninvested cash - a cross-sell opportunity.", "IDLE_CASH_SHARE")
    add("7b. Clients ever flagged concentrated (largest non-cash product > 40%)", f"{conc_f.mean():.1%} ({conc_f.sum():,} clients)", "5% - 15%",
        0.05 <= conc_f.mean() <= 0.15, "These clients carry single-product risk (cash is excluded from the largest-product rule).", "CONCENTRATED_SHARE")
    add("7c. Clients flagged both idle and concentrated (info only)", f"{(idle_f & conc_f).sum():,} clients", "report only", True,
        "Clients who both hold idle cash and one dominant fund.")

    S = {n: pd.read_csv(OUT / "staging" / f"{n}.csv") for n in ["clients", "transactions", "holdings_monthly", "interactions", "advisors", "products", "revenue"]}
    ids = set(S["clients"].client_id)
    det = {
        ("transactions", "duplicate_txn_id"): int(S["transactions"].txn_id.duplicated().sum()),
        ("transactions", "negative_amount"): int((S["transactions"].amount < 0).sum()),
        ("transactions", "orphan_client_id"): int((~S["transactions"].client_id.isin(ids)).sum()),
        ("holdings_monthly", "orphan_client_id"): int((~S["holdings_monthly"].client_id.isin(ids)).sum()),
        ("holdings_monthly", "negative_market_value"): int((S["holdings_monthly"].market_value < 0).sum()),
        ("interactions", "orphan_client_id"): int((~S["interactions"].client_id.isin(ids)).sum()),
        ("clients", "null_kyc_status"): int(S["clients"].kyc_status.isna().sum()),
    }
    man = rd("truth", "dirty_manifest").groupby(["table", "defect_type"]).size()
    detail = []
    all_match = True
    for k, v in det.items():
        mv = int(man.get(k, 0))
        all_match &= v == mv
        detail.append(f"{k[0]}.{k[1]}: detected {v:,} / manifest {mv:,}")
    extra = set(man.index) - set(det)
    all_match &= not extra
    add("8a. Independent dirty-data detection matches dirty_manifest.csv exactly", "; ".join(detail), "all 7 counts equal", all_match,
        "The quality checks to be built can be proven against a complete answer key.")
    total = sum(len(v) for v in S.values())
    dshare = sum(det.values()) / total
    add("8b. Overall dirty share of staging rows", f"{dshare:.2%} ({sum(det.values()):,} of {total:,})", "2.0% - 3.0%", 0.02 <= dshare <= 0.03,
        "About this share of loaded records will be rejected or flagged by data quality rules.", "DIRTY (raise per-table rates, e.g. holdings_monthly)")

    sign = txn.txn_type.map({"deposit": 1, "sip": 1, "switch_in": 1, "withdrawal": -1, "redemption": -1, "switch_out": -1})
    fl = pd.DataFrame({"client_id": txn.client_id, "product_id": txn.product_id, "snapshot_date": txn.me, "net": txn.amount * sign}) \
        .groupby(["client_id", "product_id", "snapshot_date"]).net.sum().reset_index()
    hs = hold[["client_id", "product_id", "snapshot_date", "market_value"]]
    prev = hs.copy()
    prev["snapshot_date"] = (pd.to_datetime(prev.snapshot_date) + pd.offsets.MonthEnd(1)).dt.strftime("%Y-%m-%d")
    r = hs.merge(prev.rename(columns={"market_value": "prev"}), on=["client_id", "product_id", "snapshot_date"]) \
        .merge(fl, on=["client_id", "product_id", "snapshot_date"], how="left")
    r["net"] = r.net.fillna(0)
    base = r.prev + r.net
    move = r.market_value - base
    okr = (move.abs() <= 0.2 * base.clip(lower=1)) & (base > 0)
    add("9. Client-product-months whose implied market movement is within +/-20%", f"{okr.mean():.3%} of {len(r):,}", ">= 99.5%", okr.mean() >= 0.995,
        "Balances reconcile: value changes are explained by flows plus plausible market moves.", "RETURN_CLIP / PRODUCT_NOISE_SD")

    lines = ["# Pattern validation", "",
             "Generated by `data_generation/validate_patterns.py` from `output/clean`, `output/staging` and `output/truth`. "
             "Active and churned follow the KPI dictionary (active = open and AUM >= Rs 1,00,000; churned = active last month-end and "
             "closed or AUM < Rs 1,00,000 this month-end).", "",
             "| Metric | Measured | Target | Result | What it means |", "|---|---|---|---|---|"]
    for m_, v, tg, ok, mean, _ in rows:
        lines.append(f"| {m_} | {v} | {tg} | {'PASS' if ok else 'FAIL'} | {mean} |")
    fails = [x for x in rows if not x[3]]
    lines += ["", f"**{len(rows) - len(fails)} of {len(rows)} rows PASS.**", ""]
    if fails:
        lines += ["## Failing metrics and the parameter to change", ""]
        lines += [f"- {x[0]}: measured {x[1]}, target {x[2]}. Config parameter: `{x[5]}`." for x in fails]
    DOC.write_text("\n".join(lines) + "\n", encoding="utf-8")

    for m_, v, tg, ok, _, fix in rows:
        print(f"[{'PASS' if ok else 'FAIL'}] {m_}: {v}  (target {tg})" + (f"  -> change {fix}" if not ok else ""))
    print(f"\nWrote {DOC}")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
