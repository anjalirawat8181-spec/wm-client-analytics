import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANALYTICS = sorted((ROOT / "sql" / "analytics").glob("*.sql"))
ETL = sorted((ROOT / "sql" / "etl").glob("*.sql"))
VIEW = re.compile(r"CREATE OR REPLACE VIEW analytics\.(\w+)")

def view_name(path):
    return VIEW.search(path.read_text(encoding="utf-8")).group(1)

def catalogue_sections():
    text = (ROOT / "docs" / "analytics_catalog.md").read_text(encoding="utf-8")
    parts = re.split(r"^## analytics\.", text, flags=re.M)[1:]
    return {p.split("\n", 1)[0].strip(): p for p in parts}

def test_at_least_18_documented_views():
    assert len(ANALYTICS) >= 18

def test_every_analytics_view_is_documented_in_the_catalogue():
    sections = catalogue_sections()
    for f in ANALYTICS:
        view = view_name(f)
        assert view in sections, f"{view} has no section in docs/analytics_catalog.md"
        body = sections[view]
        assert "**Business question:**" in body, f"{view}: missing business question"
        assert "**KPI dictionary refs:**" in body, f"{view}: missing KPI dictionary reference"
        assert "**Grain:**" in body, f"{view}: missing grain"

def test_catalogue_has_no_entries_for_missing_views():
    assert set(catalogue_sections()) == {view_name(f) for f in ANALYTICS}

def test_each_file_creates_exactly_one_view_named_like_the_file():
    for f in ANALYTICS:
        views = VIEW.findall(f.read_text(encoding="utf-8"))
        assert len(views) == 1, f"{f.name}: expected one view, found {views}"
        assert f.stem.split("_", 1)[1] == views[0], f"{f.name}: file name should end with the view name {views[0]}"

def test_analytics_views_are_read_only_definitions():
    for f in ANALYTICS:
        body = f.read_text(encoding="utf-8").upper()
        for bad in ("INSERT ", "UPDATE ", "DELETE ", "TRUNCATE ", "DROP "):
            assert bad not in body, f"{f.name} contains {bad.strip()}"

def test_etl_files_log_to_dq_exceptions_and_are_numbered():
    assert len(ETL) == 7
    for i, f in enumerate(ETL, 1):
        assert f.name.startswith(f"{i:02d}_")
        assert "mart.dq_exceptions" in f.read_text(encoding="utf-8"), f"{f.name} must log rejected rows"
