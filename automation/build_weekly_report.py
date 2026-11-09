"""Build the weekly Excel report and email draft from the dashboard JSON (the same numbers the site shows).

Usage: python automation/build_weekly_report.py
Writes reports/weekly_metrics_report.xlsx and reports/weekly_email_draft.md. No database access: run export_dashboard_data.py first.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, DataBarRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "dashboards" / "web" / "public" / "data"
OUT = ROOT / "reports"
CR = 1e7
HEAD_FILL = PatternFill("solid", fgColor="121A30")
HEAD_FONT = Font(bold=True, color="E6C878")
TITLE = Font(bold=True, size=14)


def load(name):
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


def header(ws, row, labels):
    for i, lab in enumerate(labels, 1):
        c = ws.cell(row=row, column=i, value=lab)
        c.fill, c.font = HEAD_FILL, HEAD_FONT
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[row].height = 32


def widths(ws, ws_widths):
    for i, w in enumerate(ws_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def main() -> int:
    summary, meta = load("summary"), load("meta")
    overview, att, adv = load("monthly_overview"), load("attrition_monthly"), load("advisor_scorecard")
    risk, top, dq = load("risk_distribution"), load("top_at_risk"), load("dq_scorecard")
    wb = Workbook()

    # Summary
    ws = wb.active
    ws.title = "Summary"
    ws["A1"], ws["A1"].font = "Weekly client analytics report", TITLE
    ws["A2"] = f"Data as of {summary['as_of']} (prior month {summary['prior_month']}). Synthetic data. Built {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC from commit {meta['commit']}."
    header(ws, 4, ["KPI", "Latest month", "Prior month", "Change", "Change %", "Unit"])
    spec = {"aum": ("AUM", CR, "Rs crore", "#,##0.00"), "nnm": ("Net new money", CR, "Rs crore", "#,##0.00"),
            "fee_revenue": ("Fee revenue (month)", CR, "Rs crore", "#,##0.00"), "active_clients": ("Active clients", 1, "clients", "#,##0"),
            "attrition_rate": ("Monthly attrition", 1, "percent", "0.00%"), "revenue_per_client": ("Revenue per client (month)", 1, "Rs", "#,##0")}
    r = 5
    for t in summary["tiles"]:
        label, div, unit, fmt = spec[t["key"]]
        ws.cell(r, 1, label)
        ws.cell(r, 2, t["value"] / div if t["value"] is not None else None).number_format = fmt
        ws.cell(r, 3, t["prior"] / div if t["prior"] is not None else None).number_format = fmt
        ws.cell(r, 4, f"=B{r}-C{r}").number_format = fmt if t["key"] != "attrition_rate" else "0.00%"
        ws.cell(r, 5, f'=IF(C{r}=0,"n/a",(B{r}-C{r})/ABS(C{r}))').number_format = "0.0%"
        ws.cell(r, 6, unit)
        r += 1
    ws.cell(r + 1, 1, "Trailing 12-month attrition")
    ws.cell(r + 1, 2, summary["attrition_trailing_12m"]).number_format = "0.00%"
    ws.cell(r + 2, 1, "Churned clients last month")
    ws.cell(r + 2, 2, summary["churned_last_month"]).number_format = "#,##0"
    ws.cell(r + 3, 1, "Revenue lost last month (Rs)")
    ws.cell(r + 3, 2, summary["revenue_lost_last_month"]).number_format = "#,##0"
    ws.conditional_formatting.add(f"D5:D{r - 1}", CellIsRule(operator="lessThan", formula=["0"], font=Font(color="C0262E", bold=True)))
    ws.conditional_formatting.add(f"D5:D{r - 1}", CellIsRule(operator="greaterThan", formula=["0"], font=Font(color="0B7D6B", bold=True)))
    widths(ws, [32, 16, 16, 14, 12, 12])
    ws.freeze_panes = "A5"

    # AUM and NNM (feeds the native chart on the Summary sheet)
    w2 = wb.create_sheet("AUM and NNM")
    header(w2, 1, ["Month-end", "AUM (Rs crore)", "Net new money (Rs crore)", "Inflows (Rs crore)", "Outflows (Rs crore)", "Active clients", "Fee revenue (Rs crore)", "Revenue per client (Rs)"])
    for i, m in enumerate(overview, 2):
        w2.append([m["snapshot_date"], m["aum"] / CR, m["nnm"] / CR, m["inflows"] / CR, m["outflows"] / CR, m["active_clients"], m["fee_revenue"] / CR, m["revenue_per_client"]])
        for col, f in zip("BCDEFGH", ["#,##0.00", "#,##0.00", "#,##0.00", "#,##0.00", "#,##0", "#,##0.00", "#,##0"]):
            w2[f"{col}{i}"].number_format = f
    n = len(overview) + 1
    w2.conditional_formatting.add(f"C2:C{n}", CellIsRule(operator="lessThan", formula=["0"], font=Font(color="C0262E")))
    w2.conditional_formatting.add(f"C2:C{n}", DataBarRule(start_type="min", end_type="max", color="3CCFB4"))
    widths(w2, [14, 16, 20, 16, 16, 14, 18, 20])
    w2.freeze_panes = "B2"
    ch = LineChart()
    ch.title, ch.y_axis.title, ch.height, ch.width = "AUM (Rs crore)", "Rs crore", 8.5, 20
    ch.add_data(Reference(w2, min_col=2, min_row=1, max_row=n), titles_from_data=True)
    ch.set_categories(Reference(w2, min_col=1, min_row=2, max_row=n))
    ws.add_chart(ch, "H4")
    bc = BarChart()
    bc.title, bc.height, bc.width = "Net new money (Rs crore)", 7, 20
    bc.add_data(Reference(w2, min_col=3, min_row=1, max_row=n), titles_from_data=True)
    bc.set_categories(Reference(w2, min_col=1, min_row=2, max_row=n))
    ws.add_chart(bc, "H22")

    # Attrition
    w3 = wb.create_sheet("Attrition")
    header(w3, 1, ["Month-end", "Segment", "Opening clients", "Churned clients", "New clients", "Closing clients", "Attrition rate"])
    for i, a in enumerate(att["monthly"], 2):
        w3.append([a["snapshot_date"], a["segment"], a["opening_clients"], a["churned_clients"], a["new_clients"], a["closing_clients"], a["attrition_rate"]])
        w3[f"G{i}"].number_format = "0.00%"
    w3.conditional_formatting.add(f"G2:G{len(att['monthly']) + 1}", ColorScaleRule(start_type="min", start_color="FFFFFF", end_type="max", end_color="F2646A"))
    base = len(att["monthly"]) + 4
    w3.cell(base, 1, "Attrition by days since last contact (all segments)").font = Font(bold=True)
    header(w3, base + 1, ["Contact gap", "", "Opening clients", "Churned clients", "", "", "Monthly attrition"])
    for j, g in enumerate([g for g in att["contact_gap"] if g["segment"] == "All"], base + 2):
        w3.cell(j, 1, g["gap_bucket"])
        w3.cell(j, 3, g["opening_clients"])
        w3.cell(j, 4, g["churned_clients"])
        w3.cell(j, 7, g["attrition_rate"]).number_format = "0.00%"
    widths(w3, [24, 16, 16, 16, 12, 16, 16])
    w3.freeze_panes = "A2"

    # Client risk
    w4 = wb.create_sheet("Client Risk")
    header(w4, 1, ["Risk level", "Segment", "Clients", "AUM (Rs crore)"])
    for x in risk:
        w4.append([x["risk_level"], x["segment"], x["clients"], x["aum"] / CR])
    start = len(risk) + 4
    w4.cell(start - 1, 1, "Top clients to call (client IDs only)").font = Font(bold=True)
    header(w4, start, ["Priority", "Client ID", "Segment", "Branch", "Advisor", "AUM (Rs crore)", "Days since contact", "Risk score", "Risk level", "Reasons"])
    for k, t in enumerate(top, start + 1):
        for c, v in enumerate([t["priority_rank"], t["client_id"], t["segment"], t["branch"], t["advisor_id"], t["aum"] / CR, t["days_since_last_contact"], t["risk_score"], t["risk_level"], t["reasons"]], 1):
            w4.cell(k, c, v)
        w4.cell(k, 6).number_format = "#,##0.00"
    w4.conditional_formatting.add(f"I{start + 1}:I{start + len(top)}", CellIsRule(operator="equal", formula=['"High"'], font=Font(color="C0262E", bold=True)))
    widths(w4, [12, 16, 16, 14, 10, 16, 18, 10, 12, 60])

    # Advisors
    w5 = wb.create_sheet("Advisors")
    header(w5, 1, ["Advisor", "Branch", "Team", "Active clients", "AUM (Rs crore)", "NNM 12m (Rs crore)", "Net flow rate (12m)", "Contacts per client-month", "Growth rank", "Contact rank", "Flags"])
    for i, a in enumerate(sorted(adv["advisors"], key=lambda x: x["growth_rank"]), 2):
        flags = ", ".join(f for f, on in (("Highest net flow rate", a["growth_decile"] == 1), ("Lowest contact", a["contact_decile"] == 1)) if on)
        w5.append([f"Advisor {a['advisor_id']}", a["branch"], a["team"], a["active_clients"], (a["aum"] or 0) / CR, (a["nnm_12m"] or 0) / CR,
                   a["net_flow_rate"], a["contacts_per_client_month"], a["growth_rank"], a["contact_rank"], flags])
        for col, f in zip("EFGH", ["#,##0.00", "#,##0.00", "0.0%", "0.00"]):
            w5[f"{col}{i}"].number_format = f
    w5.conditional_formatting.add(f"G2:G{len(adv['advisors']) + 1}", DataBarRule(start_type="min", end_type="max", color="6C7CFF"))
    w5.conditional_formatting.add(f"H2:H{len(adv['advisors']) + 1}", ColorScaleRule(start_type="min", start_color="F2646A", end_type="max", end_color="3CCFB4"))
    widths(w5, [14, 14, 16, 14, 16, 18, 22, 22, 12, 12, 24])
    w5.freeze_panes = "B2"

    # Data quality
    w6 = wb.create_sheet("Data Quality")
    header(w6, 1, ["Rule", "Category", "Checked", "Failures", "Pass %", "Note"])
    for i, s in enumerate(dq["scorecard"], 2):
        w6.append([s["rule"], s["category"], s["checked"], s["failures"], s["pass_pct"] / 100, s["note"]])
        w6[f"E{i}"].number_format = "0.00%"
        w6[f"C{i}"].number_format = "#,##0"
    w6.conditional_formatting.add(f"D2:D{len(dq['scorecard']) + 1}", CellIsRule(operator="greaterThan", formula=["0"], font=Font(color="C0262E", bold=True)))
    b = len(dq["scorecard"]) + 4
    w6.cell(b - 1, 1, "Planted vs caught").font = Font(bold=True)
    header(w6, b, ["Table", "Defect", "Planted", "Caught", "Missed", "False positives"])
    for k, d in enumerate(dq["detection"], b + 1):
        for c, v in enumerate([d["table"], d["defect"], d["planted"], d["caught"], d["missed"], d["false_positives"]], 1):
            w6.cell(k, c, v)
    widths(w6, [44, 18, 14, 12, 12, 70])
    w6.freeze_panes = "A2"

    OUT.mkdir(exist_ok=True)
    wb.save(OUT / "weekly_metrics_report.xlsx")

    t = {x["key"]: x for x in summary["tiles"]}

    def chg(k):
        v, p = t[k]["value"], t[k]["prior"]
        return "n/a" if not p else f"{(v - p) / abs(p) * 100:+.1f}%"

    detection = dq["detection"]
    planted, caught = sum(d["planted"] for d in detection), sum(d["caught"] for d in detection)
    md = f"""Subject: Weekly client analytics: {summary['as_of']}

Hello team,

Here is this week's snapshot (data as of {summary['as_of']}; all data is synthetic).

- AUM: Rs {t['aum']['value'] / CR:,.2f} crore ({chg('aum')} vs {summary['prior_month']})
- Net new money in the month: Rs {t['nnm']['value'] / CR:,.2f} crore ({chg('nnm')})
- Fee revenue in the month: Rs {t['fee_revenue']['value'] / CR:,.2f} crore ({chg('fee_revenue')})
- Active clients: {t['active_clients']['value']:,} ({chg('active_clients')})
- Monthly attrition: {t['attrition_rate']['value'] * 100:.2f}% ({summary['churned_last_month']} clients lost; revenue lost Rs {summary['revenue_lost_last_month']:,} a month)
- Trailing 12-month attrition: {summary['attrition_trailing_12m'] * 100:.2f}%
- Clients on the call list (High or Medium risk): {summary['at_risk_clients_listed']:,}

Data quality: {caught:,} of {planted:,} planted defects caught in the last full check; every staged row is loaded or logged.

The attached workbook has the detail by tab: AUM and NNM, Attrition, Client Risk, Advisors and Data Quality.

Regards,
Analytics team
"""
    (OUT / "weekly_email_draft.md").write_text(md, encoding="utf-8")
    print(f"Wrote {OUT / 'weekly_metrics_report.xlsx'} and weekly_email_draft.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
