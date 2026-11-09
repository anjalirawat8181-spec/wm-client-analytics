import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "dashboards" / "web" / "public" / "data"
REQUIRED = ["summary", "monthly_cube", "monthly_overview", "aum_trend", "nnm_trend", "segment_mix", "branch_summary",
            "attrition_monthly", "cohort_retention", "risk_distribution", "top_at_risk", "advisor_scorecard", "revenue",
            "allocation_mix", "dq_scorecard", "meta"]

def load(name):
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))

def test_all_files_exist_valid_and_small():
    for n in REQUIRED:
        p = DATA / f"{n}.json"
        assert p.exists(), f"{n}.json missing"
        assert p.stat().st_size < 2 * 1024 * 1024, f"{n}.json is over 2 MB"
        json.loads(p.read_text(encoding="utf-8"))

def test_summary_shape():
    s = load("summary")
    assert {t["key"] for t in s["tiles"]} == {"aum", "nnm", "fee_revenue", "active_clients", "attrition_rate", "revenue_per_client"}
    for t in s["tiles"]:
        assert len(t["series"]) == 12
        assert t["value"] is not None
    assert s["as_of"] > s["prior_month"]

def test_cube_rows_are_complete_and_non_negative_where_required():
    rows = load("monthly_cube")
    assert rows
    keys = {"snapshot_date", "segment", "branch", "aum", "active_clients", "inflows", "outflows", "nnm", "opening_clients",
            "churned_clients", "new_clients", "fee_revenue", "revenue_lost"}
    for r in rows:
        assert keys <= set(r)
        assert r["segment"] in ("Mass Affluent", "HNI", "UHNI")
        assert r["aum"] >= 0 and r["active_clients"] >= 0 and r["churned_clients"] <= r["opening_clients"]

def _keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from _keys(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _keys(v)

def test_no_client_names_or_personal_fields_exported():
    for n in REQUIRED:
        keys = set(_keys(load(n)))
        for banned in ("client_name", "advisor_name", "city", "kyc_status"):
            assert banned not in keys, f"{n}.json exports a {banned} field"

def test_top_at_risk_is_client_id_only_and_capped():
    rows = load("top_at_risk")
    assert 0 < len(rows) <= 50
    for r in rows:
        assert isinstance(r["client_id"], int)
        assert r["risk_level"] in ("High", "Medium")

def test_dq_scorecard_has_rules_and_reconciles():
    d = load("dq_scorecard")
    assert d["scorecard"]
    for r in d["reconciliation"]:
        assert r["unaccounted"] == 0

def test_meta_marks_data_as_synthetic():
    m = load("meta")
    assert m["synthetic_data"] is True
    assert m["data_window"]["months"] >= 12
