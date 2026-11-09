import json
import os
import subprocess
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import ROOT, connect

OUT = ROOT / "dashboards" / "web" / "public" / "data"
TABLEAU = ROOT / "dashboards" / "tableau_extracts"
MAX_BYTES = 2 * 1024 * 1024
TOP_AT_RISK = 50

def q(cur, sql):
    cur.execute(sql)
    return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])

def clean(v):
    if isinstance(v, Decimal):
        f = float(v)
        return int(f) if f.is_integer() else round(f, 6)
    if isinstance(v, (date, datetime)):
        return v.isoformat()[:10]
    if isinstance(v, float):
        return None if v != v else (int(v) if v.is_integer() else round(v, 6))
    if hasattr(v, "item"):
        return clean(v.item())
    return v

def records(df):
    return [{k: clean(v) for k, v in row.items()} for row in df.to_dict("records")]

def write(name, payload, must_have_rows=True):
    if must_have_rows:
        body = payload if not isinstance(payload, dict) else next((v for v in payload.values() if isinstance(v, list)), payload)
        if not body:
            raise SystemExit(f"EXPORT FAILED: {name} is empty")
    text = json.dumps(payload, separators=(",", ":"), default=str)
    if len(text.encode()) > MAX_BYTES:
        raise SystemExit(f"EXPORT FAILED: {name} is larger than 2 MB")
    json.loads(text)
    (OUT / name).write_text(text, encoding="utf-8")
    print(f"  {name:28s} {len(text) / 1024:8.1f} KB")

def git_sha():
    sha = os.getenv("GITHUB_SHA")
    if sha:
        return sha[:7]
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        return "unknown"

def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    TABLEAU.mkdir(parents=True, exist_ok=True)
    conn = connect()
    cur = conn.cursor()

    cube = q(cur, "select * from analytics.v_monthly_cube order by 1,2,3")
    overview = q(cur, "select * from analytics.v_monthly_overview order by 1")
    seg = q(cur, "select * from analytics.v_monthly_aum_nnm order by 1,2")
    att = q(cur, "select * from analytics.v_attrition_monthly order by 1,2")
    t12 = q(cur, "select * from analytics.v_attrition_trailing12 order by 1,2")
    gap = q(cur, "select * from analytics.v_contact_gap_attrition order by 1,3")
    coh = q(cur, "select * from analytics.v_cohort_retention order by 1,2")
    coh_s = q(cur, "select * from analytics.v_cohort_retention_summary order by 1")
    risk = q(cur, "select * from analytics.v_risk_distribution")
    top = q(cur, f"select * from analytics.v_top_clients_at_risk order by priority_rank limit {TOP_AT_RISK}")
    top_all = q(cur, "select count(*) n from analytics.v_top_clients_at_risk").n[0]
    adv = q(cur, "select * from analytics.v_advisor_scorecard order by growth_rank, advisor_id")
    advt = q(cur, "select advisor_id, snapshot_date, aum_rank, net_flow_rank, aum_rank_change from analytics.v_advisor_ranking_trend order by 1,2")
    rpc = q(cur, "select * from analytics.v_revenue_per_client order by 1,2")
    rlost = q(cur, "select * from analytics.v_revenue_lost order by 1,2")
    rbs = q(cur, "select snapshot_date, segment, branch, sum(active_clients) active_clients, sum(fee_revenue) fee_revenue "
                 "from analytics.v_revenue_by_segment_branch_advisor group by 1,2,3 order by 1,2,3")
    alloc = q(cur, "select * from analytics.v_asset_allocation_mix order by 1,2,3")
    branch = q(cur, "select * from analytics.v_branch_summary order by 1,2")
    dq_view = q(cur, "select * from analytics.v_data_quality_summary order by 1,2")
    counts = {}
    for t in ("dim_advisor", "dim_client", "dim_product", "fact_holdings_monthly", "fact_transactions",
              "fact_interactions", "fact_revenue", "dq_exceptions"):
        cur.execute(f"select count(*) from mart.{t}")
        counts[t] = cur.fetchone()[0]
    cur.execute("select pg_database_size(current_database())/1024.0/1024")
    db_mb = round(float(cur.fetchone()[0]), 1)
    conn.rollback()
    conn.close()

    months = sorted(overview.snapshot_date.astype(str).unique())
    last, prev = overview.iloc[-1], overview.iloc[-2]
    t12_all = t12[t12.segment == "All"].sort_values("snapshot_date")
    spark = overview.tail(12)

    def tile(key, cur_v, prev_v, series):
        return {"key": key, "value": clean(cur_v), "prior": clean(prev_v), "series": [clean(x) for x in series]}

    summary = {
        "as_of": str(last.snapshot_date), "prior_month": str(prev.snapshot_date),
        "tiles": [
            tile("aum", last.aum, prev.aum, spark.aum),
            tile("nnm", last.nnm, prev.nnm, spark.nnm),
            tile("fee_revenue", last.fee_revenue, prev.fee_revenue, spark.fee_revenue),
            tile("active_clients", last.active_clients, prev.active_clients, spark.active_clients),
            tile("attrition_rate", last.attrition_rate, prev.attrition_rate, spark.attrition_rate),
            tile("revenue_per_client", last.revenue_per_client, prev.revenue_per_client, spark.revenue_per_client),
        ],
        "attrition_trailing_12m": clean(t12_all.iloc[-1].attrition_trailing_12m) if len(t12_all) else None,
        "attrition_trailing_12m_as_of": str(t12_all.iloc[-1].snapshot_date) if len(t12_all) else None,
        "revenue_lost_last_month": clean(last.revenue_lost),
        "churned_last_month": clean(last.churned_clients),
        "at_risk_clients_listed": int(top_all),
    }
    write("summary.json", summary, must_have_rows=False)
    write("monthly_cube.json", records(cube))
    write("monthly_overview.json", records(overview))
    write("aum_trend.json", records(seg[["snapshot_date", "segment", "aum", "active_clients"]]))
    write("nnm_trend.json", records(seg[["snapshot_date", "segment", "inflows", "outflows", "nnm"]]))
    ls = seg[(seg.snapshot_date == seg.snapshot_date.max()) & (seg.segment != "All")]
    rp_last = rpc[(rpc.snapshot_date == rpc.snapshot_date.max())].set_index("segment").revenue_per_client
    at_last = att[(att.snapshot_date == att.snapshot_date.max())].set_index("segment").attrition_rate
    mix = []
    for _, r in ls.iterrows():
        mix.append({"segment": r.segment, "aum": clean(r.aum), "active_clients": clean(r.active_clients),
                    "aum_share": clean(float(r.aum) / float(ls.aum.sum())), "revenue_per_client": clean(rp_last.get(r.segment)),
                    "attrition_rate": clean(at_last.get(r.segment))})
    write("segment_mix.json", mix)
    write("branch_summary.json", records(branch))
    write("attrition_monthly.json", {"monthly": records(att), "trailing12": records(t12), "contact_gap": records(gap)})
    write("cohort_retention.json", {"cohorts": records(coh), "summary": records(coh_s)})
    write("risk_distribution.json", records(risk))
    write("top_at_risk.json", records(top))
    write("advisor_scorecard.json", {"advisors": records(adv)})
    write("revenue.json", {"per_client": records(rpc), "lost": records(rlost), "by_segment_branch": records(rbs)})
    write("allocation_mix.json", records(alloc[["snapshot_date", "segment", "asset_class", "share_pct"]]))

    dq_path = ROOT / "reports" / "dq_scorecard.json"
    dq = json.loads(dq_path.read_text(encoding="utf-8")) if dq_path.exists() else {}
    write("dq_scorecard.json", {"generated_at": dq.get("generated_at"), "overall": dq.get("overall"),
                                "reconciliation": dq.get("reconciliation", []), "detection": dq.get("detection", []),
                                "detection_note": dq.get("detection_note"),
                                "mart_vs_clean": [{"table": d["table"], "rows_differing": d["rows_differing"], "unexpected": d["unexpected"]} for d in dq.get("mart_vs_clean", [])],
                                "scorecard": dq.get("scorecard", []),
                                "exceptions": records(dq_view)}, must_have_rows=False)
    if not dq.get("scorecard"):
        raise SystemExit("EXPORT FAILED: reports/dq_scorecard.json missing or empty; run automation/dq_report.py first")

    meta = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "data_window": {"first_month_end": months[0], "last_month_end": months[-1], "months": len(months)},
            "row_counts": counts, "database_size_mb": db_mb, "commit": git_sha(),
            "synthetic_data": True}
    write("meta.json", meta, must_have_rows=False)

    for name, df in (("monthly_overview", overview), ("monthly_cube", cube), ("attrition_monthly", att), ("cohort_retention", coh),
                     ("advisor_scorecard", adv), ("advisor_ranking_trend", advt), ("top_at_risk", top), ("asset_allocation", alloc), ("revenue_per_client", rpc),
                     ("branch_summary", branch)):
        df.to_csv(TABLEAU / f"{name}.csv", index=False)
    print(f"Export OK: {len(list(OUT.glob('*.json')))} JSON files, as of {summary['as_of']}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
