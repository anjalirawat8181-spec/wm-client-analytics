"""SQL lint: every analytics view file documents itself, and the ETL files respect the audit-log contract. No database needed."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANALYTICS = sorted((ROOT / "sql" / "analytics").glob("*.sql"))
ETL = sorted((ROOT / "sql" / "etl").glob("*.sql"))


def test_at_least_18_documented_views():
    assert len(ANALYTICS) >= 18


def test_every_analytics_view_has_a_header_comment():
    for f in ANALYTICS:
        text = f.read_text(encoding="utf-8")
        lines = text.splitlines()
        header = []
        for line in lines:
            if line.startswith("--"):
                header.append(line)
            else:
                break
        joined = "\n".join(header)
        assert "Business question:" in joined, f"{f.name}: missing 'Business question:' header"
        assert "KPI dictionary refs:" in joined, f"{f.name}: missing 'KPI dictionary refs:' header"
        assert "Grain:" in joined, f"{f.name}: missing 'Grain:' header"


def test_each_file_creates_exactly_one_view_named_like_the_file():
    for f in ANALYTICS:
        text = f.read_text(encoding="utf-8")
        views = re.findall(r"CREATE OR REPLACE VIEW analytics\.(\w+)", text)
        assert len(views) == 1, f"{f.name}: expected one view, found {views}"
        assert f.stem.split("_", 1)[1] == views[0], f"{f.name}: file name should end with the view name {views[0]}"


def test_analytics_views_are_read_only_definitions():
    for f in ANALYTICS:
        body = re.sub(r"--.*", "", f.read_text(encoding="utf-8")).upper()
        for bad in ("INSERT ", "UPDATE ", "DELETE ", "TRUNCATE ", "DROP "):
            assert bad not in body, f"{f.name} contains {bad.strip()}"


def test_etl_files_log_to_dq_exceptions_and_are_numbered():
    assert len(ETL) == 7
    for i, f in enumerate(ETL, 1):
        assert f.name.startswith(f"{i:02d}_")
        assert "mart.dq_exceptions" in f.read_text(encoding="utf-8"), f"{f.name} must log rejected rows"
