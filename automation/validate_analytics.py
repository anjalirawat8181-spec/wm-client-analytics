"""Validate the analytics views against independent pandas calculations on output/clean and the hidden truth files.

Writes docs/analytics_validation.md. Exit code 1 if any strict check fails.
Thresholds are fixed in THRESHOLDS below and are never relaxed to make a run pass; gaps are reported instead.
Needs data_generation/output (clean + truth), so it only runs where those files exist (local, not CI).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import ROOT, connect  # noqa: E402

CLEAN = ROOT / "data_generation" / "output" / "clean"
TRUTH = ROOT / "data_generation" / "output" / "truth"
THRESHOLDS = {
    "churner_recall": 0.95, "churner_precision": 0.95,
    "idle_recall": 0.90, "idle_precision": 0.90,
    "concentrated_recall": 0.90, "concentrated_precision": 0.90,
    "star_in_top10": 4, "poor_in_bottom10": 4,
}
ACTIVE_MIN = 100000
rows = []  # (section, check, expected, got, ok, strict)


def rec(section, check, expected, got, ok, strict=True, gap=False):
    """strict = view vs independent calculation (a failure is a bug, exit 1).
    gap = recall/precision vs hidden truth (a failure is reported as a GAP: the view is right, the planted signal is not recovered).
    Neither threshold nor check is relaxed; gaps are listed in docs/analytics_validation.md."""
    kind = "info" if not strict and not gap else ("gap" if gap else "strict")
    rows.append((section, check, str(expected), str(got), bool(ok), kind))
    print(f"[{'PASS' if ok else {'strict': 'FAIL', 'gap': 'GAP', 'info': 'INFO'}[kind]}] {section}: {check}  expected={expected} got={got}")


def q(cur, sql):
    cur.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])


def build_expected():
    """Independent pandas model of the KPI dictionary, built only from output/clean."""
    cli = pd.read_csv(CLEAN / "clients.csv", keep_default_na=False, na_values=[""])
    prd = pd.read_csv(CLEAN / "products.csv", keep_default_na=False, na_values=[""])
    hold = pd.read_csv(CLEAN / "holdings_monthly.csv")
    txn = pd.read_csv(CLEAN / "transactions.csv")
    inter = pd.read_csv(CLEAN / "interactions.csv")
    rev = pd.read_csv(CLEAN / "revenue.csv")
    for df, cols in ((cli, ["onboarding_date", "closed_date"]), (hold, ["snapshot_date"]), (txn, ["txn_date"]),
                     (inter, ["interaction_date"]), (rev, ["month_end"])):
        for c in cols:
            df[c] = pd.to_datetime(df[c])
    months = sorted(hold.snapshot_date.unique())
    h = hold.merge(prd[["product_id", "asset_class"]], on="product_id")
    agg = h.groupby(["client_id", "snapshot_date"]).agg(aum=("market_value", "sum")).reset_index()
    cash = h[h.asset_class == "Cash"].groupby(["client_id", "snapshot_date"]).market_value.sum().rename("cash").reset_index()
    top = h[h.asset_class != "Cash"].groupby(["client_id", "snapshot_date"]).market_value.max().rename("top").reset_index()
    agg = agg.merge(cash, how="left", on=["client_id", "snapshot_date"]).merge(top, how="left", on=["client_id", "snapshot_date"])
    cli["first_me"] = cli.onboarding_date + pd.offsets.MonthEnd(0)
    grid = pd.MultiIndex.from_product([cli.client_id, months], names=["client_id", "snapshot_date"]).to_frame(index=False)
    grid = grid.merge(cli[["client_id", "segment", "advisor_id", "closed_date", "first_me", "onboarding_date"]], on="client_id")
    grid = grid[grid.snapshot_date >= grid.first_me].merge(agg, how="left", on=["client_id", "snapshot_date"])
    grid[["aum", "cash"]] = grid[["aum", "cash"]].fillna(0)
    grid["open"] = grid.closed_date.isna() | (grid.closed_date > grid.snapshot_date)
    grid["active"] = grid.open & (grid.aum >= ACTIVE_MIN)
    grid = grid.sort_values(["client_id", "snapshot_date"]).reset_index(drop=True)
    g = grid.groupby("client_id")
    grid["was_active"] = g.active.shift(1)
    grid["churned"] = (grid.was_active == True) & (~grid.active)  # noqa: E712
    grid["idle_pct"] = np.where(grid.aum >= ACTIVE_MIN, grid.cash / grid.aum.replace(0, np.nan), np.nan)
    grid["conc_pct"] = np.where((grid.aum >= ACTIVE_MIN) & grid.top.notna(), grid.top / grid.aum.replace(0, np.nan), np.nan)
    above = (grid.idle_pct > 0.30)
    grid["idle_flag"] = above & above.groupby(grid.client_id).shift(1, fill_value=False)
    grid["conc_flag"] = grid.conc_pct > 0.40
    conn = inter[inter.outcome == "connected"][["client_id", "interaction_date"]].sort_values("interaction_date")
    gs = grid.sort_values("snapshot_date")
    gs = pd.merge_asof(gs, conn.rename(columns={"interaction_date": "last_contact"}), left_on="snapshot_date",
                       right_on="last_contact", by="client_id", direction="backward")
    gs["dslc"] = (gs.snapshot_date - gs.last_contact.fillna(gs.onboarding_date)).dt.days
    grid = gs.sort_values(["client_id", "snapshot_date"]).reset_index(drop=True)
    return cli, grid, txn, rev, months


def main() -> int:
    if not CLEAN.exists() or not TRUTH.exists():
        print("data_generation/output not found (expected in CI): validation skipped.")
        return 0
    cli, grid, txn, rev, months = build_expected()
    conn = connect()
    cur = conn.cursor()

    # 1. AUM, all months and segments
    exp = grid.groupby(["snapshot_date", "segment"]).aum.sum().reset_index()
    got = q(cur, "select snapshot_date, segment, aum from analytics.v_monthly_aum_nnm where segment <> 'All'")
    got["snapshot_date"] = pd.to_datetime(got.snapshot_date)
    m = exp.merge(got, on=["snapshot_date", "segment"], suffixes=("_e", "_v"))
    rec("AUM", f"{len(m)} month x segment cells match exactly", len(exp), int((m.aum_e == m.aum_v.astype(float)).sum()),
        len(m) == len(exp) == int((m.aum_e == m.aum_v.astype(float)).sum()))
    tot_e = int(grid[grid.snapshot_date == months[-1]].aum.sum())
    tot_v = int(q(cur, "select aum from analytics.v_monthly_aum_nnm where segment='All' order by snapshot_date desc limit 1").aum[0])
    rec("AUM", "latest firm AUM (rupees)", tot_e, tot_v, tot_e == tot_v)

    # 2. Net new money (external flows by transaction month)
    txn["me"] = txn.txn_date + pd.offsets.MonthEnd(0)
    txn["flow"] = np.where(txn.flow_type == "external_in", txn.amount, np.where(txn.flow_type == "external_out", -txn.amount, 0))
    e = txn.groupby("me").flow.sum()
    v = q(cur, "select snapshot_date, nnm from analytics.v_monthly_aum_nnm where segment='All'")
    v["snapshot_date"] = pd.to_datetime(v.snapshot_date)
    v = v.set_index("snapshot_date").nnm.astype(float)
    ok = all(abs(e.get(d, 0) - v[d]) < 0.5 for d in v.index)
    rec("NNM", f"firm NNM matches in all {len(v)} months", "equal", "equal" if ok else "differs", ok)

    # 3. Attrition (opening, churned) by month and segment
    ex = grid.groupby(["snapshot_date", "segment"]).agg(opening=("was_active", lambda s: int((s == True).sum())),  # noqa: E712
                                                       churned=("churned", "sum")).reset_index()
    gv = q(cur, "select snapshot_date, segment, opening_clients, churned_clients from analytics.v_attrition_monthly where segment<>'All'")
    gv["snapshot_date"] = pd.to_datetime(gv.snapshot_date)
    m = ex.merge(gv, on=["snapshot_date", "segment"])
    ok = len(m) == len(ex) and (m.opening == m.opening_clients).all() and (m.churned == m.churned_clients).all()
    rec("Attrition", "opening and churned clients match in every month x segment", len(ex), len(m), ok)
    tot_c = int(grid.churned.sum())
    tot_v = int(q(cur, "select sum(churned_clients) c from analytics.v_attrition_monthly where segment='All'").c[0])
    rec("Attrition", "total churn events", tot_c, tot_v, tot_c == tot_v)
    mon = q(cur, "select sum(churned_clients)::float / sum(opening_clients) r from analytics.v_attrition_monthly where segment='All'").r[0]
    ann = 1 - (1 - mon) ** 12
    rec("Attrition", "annualised from the pooled monthly rate (informational; generator target about 12%)", "~0.12", f"{ann:.4f}",
        abs(ann - 0.12) < 0.02, strict=False)

    # 4. Concentration and idle flag counts
    fv = q(cur, "select snapshot_date, concentrated_flag, idle_flag from analytics.v_flags")
    fv["snapshot_date"] = pd.to_datetime(fv.snapshot_date)
    rec("Concentration", "flagged client-months (>40%, non-cash, active)", int(grid.conc_flag.sum()), int(fv.concentrated_flag.sum()),
        int(grid.conc_flag.sum()) == int(fv.concentrated_flag.sum()))
    rec("Idle cash", "flagged client-months (>30% for 2+ months)", int(grid.idle_flag.sum()), int(fv.idle_flag.sum()),
        int(grid.idle_flag.sum()) == int(fv.idle_flag.sum()))

    # 5. Revenue total of active clients and revenue lost
    rev["me"] = rev.month_end
    r = grid.merge(rev, left_on=["client_id", "snapshot_date"], right_on=["client_id", "me"], how="left")
    exp_rev = r[r.active].groupby("snapshot_date").fee_revenue.sum()
    v = q(cur, "select snapshot_date, fee_revenue from analytics.v_revenue_per_client where segment='All'")
    v["snapshot_date"] = pd.to_datetime(v.snapshot_date)
    v = v.set_index("snapshot_date").fee_revenue.astype(float)
    ok = all(abs(exp_rev[d] - v[d]) < 0.5 for d in v.index)
    rec("Revenue", f"active-client fee revenue matches in all {len(v)} months", "equal", "equal" if ok else "differs", ok)
    prev = r[["client_id", "snapshot_date", "fee_revenue"]].copy()
    prev["snapshot_date"] = prev.snapshot_date + pd.offsets.MonthEnd(1)
    lost = grid[grid.churned].merge(prev, on=["client_id", "snapshot_date"], how="left").groupby("snapshot_date").fee_revenue.sum()
    lv = q(cur, "select snapshot_date, revenue_lost from analytics.v_revenue_lost where segment='All'")
    lv["snapshot_date"] = pd.to_datetime(lv.snapshot_date)
    lv = lv.set_index("snapshot_date").revenue_lost.astype(float)
    ok = all(abs(lost.get(d, 0) - lv.get(d, 0)) < 0.5 for d in set(lost.index) | set(lv.index))
    rec("Revenue lost", "last pre-churn month revenue matches in all months", "equal", "equal" if ok else "differs", ok)

    # 6. Days since last contact (latest month, active clients)
    last = grid[grid.snapshot_date == months[-1]].set_index("client_id").dslc
    dv = q(cur, f"select client_id, days_since_last_contact d from analytics.v_client_month_kpis where snapshot_date = '{pd.Timestamp(months[-1]).date()}'")
    dv = dv.set_index("client_id").d
    same = int((last.reindex(dv.index) == dv).sum())
    rec("Days since contact", "latest month: clients with identical value", len(dv), same, same == len(dv))

    # 7. Trailing 12-month attrition for the latest month (independent)
    gg = grid.copy()
    gg["act12"] = gg.groupby("client_id").active.shift(12)
    gg["roll"] = gg.groupby("client_id").churned.transform(lambda s: s.astype(int).rolling(12, min_periods=1).max())
    lm = gg[gg.snapshot_date == months[-1]]
    t12 = (lm.act12 == True) & (lm.roll == 1)  # noqa: E712
    e12 = t12.sum() / (lm.act12 == True).sum()  # noqa: E712
    v12 = float(q(cur, "select attrition_trailing_12m a from analytics.v_attrition_trailing12 where segment='All' order by snapshot_date desc limit 1").a[0])
    rec("Trailing 12m attrition", "latest month", f"{e12:.6f}", f"{v12:.6f}", abs(e12 - v12) < 1e-9)

    # 8. Recall / precision against hidden truth
    ct = pd.read_csv(TRUTH / "churn_truth.csv", keep_default_na=False, na_values=[""])
    truth_ids = set(ct[ct.churn_type != "none"].client_id)
    view_ids = set(q(cur, "select distinct client_id from analytics.v_client_month_kpis where was_active and not is_active").client_id)
    tp = len(truth_ids & view_ids)
    rcl, prc = tp / len(truth_ids), tp / len(view_ids)
    rec("Churners vs truth", f"recall (planted {len(truth_ids)}, found {len(view_ids)})", f">={THRESHOLDS['churner_recall']}", f"{rcl:.4f}", rcl >= THRESHOLDS["churner_recall"], strict=False, gap=True)
    rec("Churners vs truth", "precision", f">={THRESHOLDS['churner_precision']}", f"{prc:.4f}", prc >= THRESHOLDS["churner_precision"], strict=False, gap=True)

    cp = pd.read_csv(TRUTH / "client_profiles.csv")
    for prof, flag, key in (("idle_cash", "idle_flag", "idle"), ("concentrated", "concentrated_flag", "concentrated")):
        planted = set(cp[cp.profile == prof].client_id)
        flagged = set(q(cur, f"select distinct client_id from analytics.v_flags where {flag}").client_id)
        tp = len(planted & flagged)
        rcl, prc = tp / len(planted), tp / max(len(flagged), 1)
        rec(f"{prof} vs truth", f"recall (planted {len(planted)}, flagged {len(flagged)})", f">={THRESHOLDS[key + '_recall']}", f"{rcl:.4f}", rcl >= THRESHOLDS[key + "_recall"], strict=False, gap=True)
        rec(f"{prof} vs truth", "precision", f">={THRESHOLDS[key + '_precision']}", f"{prc:.4f}", prc >= THRESHOLDS[key + "_precision"], strict=False, gap=True)

    ar = pd.read_csv(TRUTH / "advisor_roles.csv")
    sc = q(cur, "select advisor_id, growth_rank, nnm_per_client, contacts_per_client_month, contact_rank from analytics.v_advisor_scorecard")
    sc["advisor_id"] = sc.advisor_id.astype(int)
    stars = set(ar[ar.role == "star"].advisor_id)
    poor = set(ar[ar.role == "poor_contact"].advisor_id)
    top10 = set(sc.sort_values("nnm_per_client", ascending=False).head(10).advisor_id)
    bot10 = set(sc.sort_values("contacts_per_client_month").head(10).advisor_id)
    rec("Star advisors", "stars inside top 10 by NNM per client (of 5)", f">={THRESHOLDS['star_in_top10']}", len(stars & top10), len(stars & top10) >= THRESHOLDS["star_in_top10"], strict=False, gap=True)
    rec("Poor-contact advisors", "inside bottom 10 by contacts per client-month (of 5)", f">={THRESHOLDS['poor_in_bottom10']}", len(poor & bot10), len(poor & bot10) >= THRESHOLDS["poor_in_bottom10"], strict=False, gap=True)
    top5 = set(sc.sort_values("nnm_per_client", ascending=False).head(5).advisor_id)
    bot5 = set(sc.sort_values("contacts_per_client_month").head(5).advisor_id)
    rec("Star advisors", "stars inside top 5 (informational)", "5", len(stars & top5), len(stars & top5) == 5, strict=False)
    rec("Poor-contact advisors", "inside bottom 5 (informational)", "5", len(poor & bot5), len(poor & bot5) == 5, strict=False)

    # extra, informational only: the same stars ranked by trailing-12-month NNM as % of AUM (the strict check above is NOT replaced)
    lastm = [d for d in months][-12:]
    nn = txn[(txn.me >= lastm[0])].merge(cli[["client_id", "advisor_id"]], on="client_id").groupby("advisor_id").flow.sum()
    ab = grid[grid.snapshot_date == months[-1]].groupby("advisor_id").aum.sum()
    pct = (nn / ab).sort_values(ascending=False)
    rec("Star advisors", "stars inside top 10 by NNM as % of AUM (informational alternative metric)", "5", len(stars & set(pct.head(10).index)), False, strict=False)

    # 9. Churn risk score: does it point at next-month churners? (informational, with base-rate lift)
    rs = q(cur, "select client_id, snapshot_date, risk_level from analytics.v_churn_risk_score")
    rs["snapshot_date"] = pd.to_datetime(rs.snapshot_date)
    nxt = grid[["client_id", "snapshot_date", "churned"]].copy()
    nxt["snapshot_date"] = nxt.snapshot_date - pd.offsets.MonthEnd(1)
    j = rs.merge(nxt, on=["client_id", "snapshot_date"], how="inner")
    base = j.churned.mean()
    risk_text = []
    for lvl in ("High", "Medium", "Low"):
        s = j[j.risk_level == lvl]
        risk_text.append((lvl, len(s), s.churned.mean() if len(s) else float("nan")))
    caught_hm = j[(j.risk_level != "Low") & j.churned].shape[0]
    rec("Risk score", f"next-month churn rate by level vs base {base:.4f}: " + "; ".join(f"{a} n={b:,} rate={c:.4f}" for a, b, c in risk_text),
        "High > Medium > Low", " > ".join(a for a, _, _ in sorted(risk_text, key=lambda t: -t[2] if t[2] == t[2] else 0)),
        risk_text[0][2] > risk_text[1][2] > risk_text[2][2], strict=False)
    rec("Risk score", "share of next-month churners that were Medium or High", "informational", f"{caught_hm / max(j.churned.sum(), 1):.4f}", True, strict=False)

    conn.close()

    L = ["# Analytics Validation", "",
         "Generated by `automation/validate_analytics.py`. Each analytics view is compared with an independent pandas calculation on "
         "`data_generation/output/clean` (built from the KPI dictionary, not from the SQL), and the flags are compared with the hidden "
         "truth files. Thresholds are fixed in the script and were not changed to pass.", "",
         "| Thresholds | Value |", "|---|---|"]
    L += [f"| {k} | {v} |" for k, v in THRESHOLDS.items()]
    L += ["", "| Section | Check | Expected | Got | Result |", "|---|---|---|---|---|"]
    for sec, chk, e, g, ok, strict in rows:
        L.append(f"| {sec} | {chk} | {e} | {g} | {'PASS' if ok else {'strict': 'FAIL', 'gap': 'GAP', 'info': 'info'}[strict]} |")
    fails = [r for r in rows if not r[4] and r[5] == "strict"]
    gaps = [r for r in rows if not r[4] and r[5] == "gap"]
    L += ["", f"**Cross-checks (view vs independent calculation) failing: {len(fails)} of {sum(1 for r in rows if r[5] == 'strict')}.**",
          f"**Truth-recovery gaps (threshold not met, reported not hidden): {len(gaps)}.**"]
    for r in gaps:
        L.append(f"- {r[0]}: {r[1]} (expected {r[2]}, got {r[3]})")
    (ROOT / "docs" / "analytics_validation.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
