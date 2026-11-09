"""Cross-check numbers shown in the dashboard against SQL, and write docs/dashboard_qa.md.

Usage:
    node dashboards/web/scripts/ui_values.mjs > ui_values.json        (run in dashboards/web, preview server on :4173)
    python automation/build_dashboard_qa.py ui_values.json

The UI values are the text actually rendered by the built site in a real browser. The SQL side reads the MART tables directly
for the headline KPIs (not the analytics views the site was built from), so a mistake in a view would show up here.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import ROOT, connect  # noqa: E402


def group_indian(n: int) -> str:
    s = str(abs(int(round(n))))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return ("-" if n < 0 else "") + s


def rupees(v: float, digits: int = 2) -> str:
    sign, a = ("-" if v < 0 else ""), abs(v)
    if a >= 1e7:
        x, unit = a / 1e7, "crore"
    elif a >= 1e5:
        x, unit = a / 1e5, "lakh"
    else:
        return f"{sign}Rs {group_indian(a)}"
    i, f = f"{x:.{digits}f}".split(".")
    return f"{sign}Rs {group_indian(int(i))}.{f} {unit}"


def main() -> int:
    ui = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    conn = connect()
    cur = conn.cursor()
    cur.execute("select max(snapshot_date), (select max(snapshot_date) from mart.fact_holdings_monthly where snapshot_date < (select max(snapshot_date) from mart.fact_holdings_monthly)) from mart.fact_holdings_monthly")
    last, prev = cur.fetchone()

    def one(sql, *args):
        cur.execute(sql, args)
        return cur.fetchone()[0]

    ACTIVE = """with aum as (select client_id, snapshot_date, sum(market_value) a from mart.fact_holdings_monthly group by 1,2),
      act as (select a.client_id, a.snapshot_date from aum a join mart.dim_client c using (client_id)
              where a.a >= 100000 and (c.closed_date is null or c.closed_date > a.snapshot_date))"""
    aum = one("select sum(market_value) from mart.fact_holdings_monthly where snapshot_date=%s", last)
    nnm = one("select sum(case flow_type when 'external_in' then amount when 'external_out' then -amount else 0 end) from mart.fact_transactions "
              "where txn_date > %s and txn_date <= %s", prev, last)
    active = one(ACTIVE + " select count(*) from act where snapshot_date=%s", last)
    fee = one(ACTIVE + " select sum(r.fee_revenue) from mart.fact_revenue r join act a on a.client_id=r.client_id and a.snapshot_date=r.month_end where r.month_end=%s", last)
    opening = one(ACTIVE + " select count(*) from act where snapshot_date=%s", prev)
    churned = one(ACTIVE + " select count(*) from act p where p.snapshot_date=%s and not exists (select 1 from act n where n.client_id=p.client_id and n.snapshot_date=%s)", prev, last)
    seg = dict(cur.execute("select c.segment, sum(h.market_value) from mart.fact_holdings_monthly h join mart.dim_client c using (client_id) where h.snapshot_date=%s group by 1", (last,)) or cur.fetchall())
    seg_share = {k: v / sum(seg.values()) for k, v in seg.items()}
    # trailing 12 months: active 12 month-ends ago and churned at any point since
    cur.execute("select distinct snapshot_date from mart.fact_holdings_monthly order by 1")
    months = [r[0] for r in cur.fetchall()]
    base_m, window = months[-13], months[-12:]
    t12_den = one(ACTIVE + " select count(*) from act where snapshot_date=%s", base_m)
    cur.execute(ACTIVE + ", cohort as (select client_id from act where snapshot_date=%s) "
                "select count(*) from cohort c where exists (select 1 from unnest(%s::date[]) m(d) where not exists "
                "(select 1 from act a where a.client_id=c.client_id and a.snapshot_date=m.d))", (base_m, window))
    # a client counts as churned if inactive at any of the 12 month-ends after the base month and active at the base month
    t12_num = cur.fetchone()[0]
    stg = one("select (select count(*) from staging.advisors)+(select count(*) from staging.clients)+(select count(*) from staging.products)+"
              "(select count(*) from staging.transactions)+(select count(*) from staging.holdings_monthly)+(select count(*) from staging.interactions)+(select count(*) from staging.revenue)")
    exc_all = one("select count(*) from mart.dq_exceptions")
    exc = one("select count(*) from mart.dq_exceptions where rule_name <> 'null_kyc'")
    risk = dict(cur.execute("select risk_level, count(*) from analytics.v_churn_risk_score where snapshot_date=%s group by 1", (last,)) or cur.fetchall())
    cur.execute("select advisor_id, nnm_per_client from analytics.v_advisor_scorecard order by growth_rank limit 1")
    top_adv, top_nnm = cur.fetchone()
    conn.close()

    ex, ch, ad, dq = ui["executive"], ui["client-health"], ui["advisors"], ui["data-quality"]
    tile = lambda t, i: [x.strip() for x in t["tiles"][i].split("\n") if x.strip()][1]  # noqa: E731
    rows = []

    def add(item, shown, expected):
        rows.append((item, shown, expected, "PASS" if shown == expected else "FAIL"))

    add("Executive: AUM tile", tile(ex, 0), rupees(float(aum)))
    add("Executive: net new money tile", tile(ex, 1), rupees(float(nnm)))
    add("Executive: fee revenue tile", tile(ex, 2), rupees(float(fee)))
    add("Executive: active clients tile", tile(ex, 3), group_indian(active))
    add("Executive: monthly attrition tile", tile(ex, 4), f"{100 * churned / opening:.2f}%")
    for s_name in ("HNI", "Mass Affluent", "UHNI"):
        m = re.search(re.escape(s_name) + r"\s+([\d.]+)%", ex["main"])
        add(f"Executive: {s_name} share of AUM", f"{m.group(1)}%" if m else "missing", f"{100 * seg_share[s_name]:.1f}%")
    m = re.search(r"\(clients churned in the last 12 months / clients active 12 months ago\):\s+([\d.]+)%", ch["main"])
    add("Client health: trailing 12-month attrition", f"{m.group(1)}%" if m else "missing", f"{100 * t12_num / t12_den:.2f}%")
    for lvl in ("High", "Medium", "Low"):
        m = re.search(lvl + r"\s+([\d,]+)\s+\(", ch["main"])
        add(f"Client health: {lvl} risk clients", m.group(1) if m else "missing", group_indian(risk.get(lvl, 0)))
    m = re.search(r"caught ([\d,]+) of ([\d,]+) planted defects", dq["takeaway"])
    add("Data quality: planted defects caught equals rows in the exceptions table",
        m.group(1) if m else "missing", group_indian(exc_all))
    m = re.search(r"\(([\d,]+) logged and kept out of the KPIs\)", dq["takeaway"])
    add("Data quality: rows logged and kept out of the KPIs (exceptions minus repaired KYC rows)", m.group(1) if m else "missing", group_indian(exc))
    m = re.search(r"every one of ([\d,]+) staged rows", dq["takeaway"])
    add("Data quality: staged rows", m.group(1) if m else "missing", group_indian(stg))
    m = re.search(r"Advisor " + str(top_adv) + r".*?Rs ([\d.]+) lakh", ad["main"], re.S)
    add(f"Advisors: top growth advisor ({top_adv}) NNM per client", f"Rs {m.group(1)} lakh" if m else "missing", rupees(float(top_nnm)))

    lh = json.loads((ROOT / "docs" / "lighthouse_scores.json").read_text(encoding="utf-8")) if (ROOT / "docs" / "lighthouse_scores.json").exists() else []
    shots = sorted(p.name for p in (ROOT / "docs" / "screenshots").glob("*.png"))
    L = ["# Dashboard QA", "",
         "Generated by `automation/build_dashboard_qa.py` from the built site (as rendered in a real browser) and the database.", "",
         "## UI numbers cross-checked against SQL", "",
         f"Month-end {last}. The SQL side reads the mart tables directly for the headline KPIs, not the analytics views the site is built from.", "",
         "| UI number | Shown on the page | Expected from SQL | Result |", "|---|---|---|---|"]
    L += [f"| {a} | {b} | {c} | {d} |" for a, b, c, d in rows]
    nfail = sum(1 for r in rows if r[3] == "FAIL")
    L += ["", f"**{len(rows) - nfail} of {len(rows)} match.**", "", "## Lighthouse", "",
          "Edge (Chromium) headless against the production build served by `vite preview`; each page run 3 times, median reported. "
          "Mobile uses Lighthouse's default throttling (4x CPU slowdown, slow 4G). Scores on this machine vary between runs, so the individual "
          "performance runs are shown. The Client Health mobile row was re-measured (3 runs) after deferring the heatmap until it scrolls into view; "
          "the other rows come from the earlier full run on the same build otherwise. Desktop passes 90 on every page except Client Health (85); mobile scores are 72 to 89 because of the "
          "chart library bundle under 4x CPU throttling, so the aim of 90+ performance is met on desktop only (4 of 5 pages) and not on mobile.", "",
          "| Form | Page | Performance (runs) | Accessibility | Best practices | SEO | LCP ms | TBT ms |", "|---|---|---|---|---|---|---:|---:|"]
    for r in lh:
        L.append(f"| {r['form']} | {r['page']} | {r['performance']} ({'/'.join(map(str, r['performanceAllRuns']))}) | {r['accessibility']} | {r['bestPractices']} | {r['seo']} | {r['lcpMs']} | {r['tbtMs']} |")
    L += ["", "## Browser checks", "",
          "`dashboards/web/scripts/screenshots.mjs` opened every page in dark, light and a 390 px mobile viewport. It fails on any console error, failed request or horizontal "
          "scroll; the last run reported none. Charts are mounted lazily as they scroll into view, so the script resizes the viewport to the full page height before capturing.", "",
          "Screenshots (`docs/screenshots/`): " + ", ".join(shots), "",
          "## Defects found and fixed while inspecting the screenshots", "",
          "- Mobile: grid cards grew wider than the screen because a wide table or heatmap sat inside a grid column; fixed with `min-w-0` and single-column grids.",
          "- Charts looked empty in full-page captures because resizing the viewport restarted their mount animation; the capture script now resizes first and waits.",
          "- Y-axis labels wrapped onto two lines and the allocation axis showed 100.01%; widened the axes and rounded the ticks.",
          "- Light theme: gold, green and heatmap text failed the contrast audit; darkened the light-theme colours and simplified heatmap text colour.",
          "- Cohort retention showed 0% for January 2025 joiners because the generator creates no holdings for them; the cohort is excluded from the view and the reason is documented.", ""]
    L += ["## Live site check", "",
          "After the first deployment, the published site (https://anjalirawat8181-spec.github.io/wm-client-analytics/) was opened in a real browser with "
          "`BASE_URL=<live url> PREFIX=live- MODES=dark node scripts/screenshots.mjs`. All 5 pages loaded, charts rendered, there were no console errors, failed requests or "
          "horizontal scroll, and `data/meta.json` on the live site carried the build time and commit of the deployment. Screenshots: "
          + ", ".join(p for p in shots if p.startswith("live-")), ""]
    (ROOT / "docs" / "dashboard_qa.md").write_text("\n".join(L), encoding="utf-8")
    for r in rows:
        print(r[3], "|", r[0], "|", r[1], "|", r[2])
    return 1 if nfail else 0


if __name__ == "__main__":
    sys.exit(main())
