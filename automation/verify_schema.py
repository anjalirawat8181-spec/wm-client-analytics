"""Verify the staging and mart schemas.

Structural checks (tables, columns, keys, no stray indexes) plus behavioural
checks: valid rows are accepted and every dirty-data pattern is rejected by
the mart. All test rows are written inside one transaction that is rolled
back, so the database is left unchanged.

Usage: python automation/verify_schema.py   (exit code 0 = all passed)
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parent.parent

MART = {
    "dim_advisor": ["advisor_id", "advisor_name", "branch", "team", "join_date"],
    "dim_client": ["client_id", "client_name", "advisor_id", "segment", "onboarding_date",
                   "onboarding_aum", "city", "risk_profile", "kyc_status", "account_status",
                   "closed_date"],
    "dim_product": ["product_id", "product_name", "asset_class", "fund_house", "fee_pct"],
    "dim_date": ["date_key", "full_date", "year", "quarter", "month", "month_name",
                 "month_start", "month_end", "is_month_end"],
    "fact_holdings_monthly": ["client_id", "product_id", "snapshot_date", "units", "market_value"],
    "fact_transactions": ["txn_id", "client_id", "product_id", "txn_date", "txn_type",
                          "flow_type", "amount"],
    "fact_interactions": ["interaction_id", "client_id", "advisor_id", "interaction_date",
                          "channel", "outcome"],
    "fact_revenue": ["client_id", "month_end", "fee_revenue"],
    "dq_exceptions": ["exception_id", "detected_at", "source_table", "source_key",
                      "rule_name", "rule_detail", "raw_record"],
}
STAGING = {
    "advisors": "dim_advisor", "clients": "dim_client", "products": "dim_product",
    "transactions": "fact_transactions", "holdings_monthly": "fact_holdings_monthly",
    "interactions": "fact_interactions", "revenue": "fact_revenue",
}

ALLOWED_INDEXES = {"idx_holdings_snapshot_date"}
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail and not ok else ""))


def cols(conn, schema, table):
    rows = conn.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = :s AND table_name = :t ORDER BY ordinal_position"),
        {"s": schema, "t": table}).fetchall()
    return [r[0] for r in rows]


def rejects(conn, sql, expect_sqlstate="23"):
    """True if the statement fails with an integrity error (SQLSTATE class 23)."""
    conn.exec_driver_sql("SAVEPOINT t")
    try:
        conn.exec_driver_sql(sql)
    except Exception as exc:
        conn.exec_driver_sql("ROLLBACK TO SAVEPOINT t")
        return str(getattr(getattr(exc, "orig", None), "pgcode", "")).startswith(expect_sqlstate)
    conn.exec_driver_sql("ROLLBACK TO SAVEPOINT t")
    return False


def accepts(conn, sql):
    conn.exec_driver_sql("SAVEPOINT t")
    try:
        conn.exec_driver_sql(sql)
        conn.exec_driver_sql("RELEASE SAVEPOINT t")
        return True
    except Exception:
        conn.exec_driver_sql("ROLLBACK TO SAVEPOINT t")
        return False


def structural(conn):
    for t, expected in MART.items():
        check(f"mart.{t} columns", cols(conn, "mart", t) == expected, str(cols(conn, "mart", t)))
    for t, mart_t in STAGING.items():
        got = cols(conn, "staging", t)
        check(f"staging.{t} mirrors mart.{mart_t} + audit cols",
              got == MART[mart_t] + ["_loaded_at", "_batch_id"], str(got))

    n = conn.execute(text(
        "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace "
        "WHERE n.nspname = 'staging'")).scalar()
    check("staging has zero constraints", n == 0, f"{n} found")
    n = conn.execute(text(
        "SELECT count(*) FROM information_schema.columns "
        "WHERE table_schema = 'staging' AND is_nullable = 'NO'")).scalar()
    check("staging has no NOT NULL columns", n == 0, f"{n} found")


    bad = conn.execute(text(
        "SELECT i.indexname FROM pg_indexes i "
        "WHERE i.schemaname IN ('staging', 'mart') AND NOT EXISTS ("
        "  SELECT 1 FROM pg_constraint c JOIN pg_class ic ON ic.oid = c.conindid "
        "  WHERE ic.relname = i.indexname AND c.contype IN ('p', 'u'))")).fetchall()
    # idx_holdings_snapshot_date is the one deliberate performance index (sql/schema/05_performance_indexes.sql,
    # justified in docs/query_optimization.md). Any other secondary index is still a failure.
    bad = [b for b in bad if b[0] not in ALLOWED_INDEXES]
    check("no secondary indexes beyond PK/UNIQUE and the documented performance index", not bad, str([b[0] for b in bad]))

    schemas = {r[0] for r in conn.execute(text(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('staging','mart','analytics')")).fetchall()}
    check("schemas staging and mart exist (analytics is allowed: it holds views only)", {"staging", "mart"} <= schemas)
    n_tables = conn.execute(text("SELECT count(*) FROM information_schema.tables "
                                 "WHERE table_schema = 'analytics' AND table_type = 'BASE TABLE'")).scalar()
    check("analytics schema holds no stored tables, only views", n_tables == 0, f"{n_tables} tables")

    no_comment = conn.execute(text(
        "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
        "WHERE n.nspname = 'mart' AND c.relkind = 'r' AND obj_description(c.oid) IS NULL")).fetchall()
    check("every mart table has a grain comment", not no_comment, str([r[0] for r in no_comment]))

    fk = conn.execute(text(
        "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace "
        "WHERE n.nspname = 'mart' AND c.contype = 'f'")).scalar()
    check("mart foreign key count is 12", fk == 12, f"{fk} found")


def behavioural(conn):
    # The behavioural tests insert fixed IDs (client 1, advisor 1, txn 1 ...). Once the ETL has loaded real data those IDs
    # collide, so these tests only make sense on an empty database. They are skipped, not weakened, when data is present.
    loaded = conn.execute(text("SELECT (SELECT count(*) FROM mart.dim_client) + (SELECT count(*) FROM staging.clients)")).scalar()
    if loaded:
        print("SKIPPED behavioural checks: database already holds data (they need empty staging and mart tables).")
        return

    parents = [
        "INSERT INTO mart.dim_advisor VALUES (1, 'A', 'Mumbai', 'T1', '2020-01-01')",
        "INSERT INTO mart.dim_product VALUES (1, 'P Equity', 'Equity', 'FH', 1.50)",
        "INSERT INTO mart.dim_product VALUES (2, 'Cash', 'Cash', 'N/A', 0)",
        "INSERT INTO mart.dim_date VALUES (20260131, '2026-01-31', 2026, 1, 1, 'January', '2026-01-01', '2026-01-31', true)",
        "INSERT INTO mart.dim_date VALUES (20260115, '2026-01-15', 2026, 1, 1, 'January', '2026-01-01', '2026-01-31', false)",
        "INSERT INTO mart.dim_client VALUES (1, 'C', 1, 'Mass Affluent', '2025-01-01', 800000, 'Pune', 'Moderate', 'verified', 'open', NULL)",
    ]
    check("valid parent rows accepted", all(accepts(conn, s) for s in parents))

    client = "INSERT INTO mart.dim_client VALUES ({id}, 'C', 1, '{seg}', '2025-01-01', {aum}, 'Pune', '{risk}', '{kyc}', '{st}', {closed})"

    def c(id=2, seg="Mass Affluent", aum=800000, risk="Moderate", kyc="verified", st="open", closed="NULL"):
        return client.format(id=id, seg=seg, aum=aum, risk=risk, kyc=kyc, st=st, closed=closed)

    check("segment boundary: HNI at 2500000 accepted", accepts(conn, c(10, "HNI", 2500000)))
    check("segment boundary: HNI at 50000000 accepted", accepts(conn, c(11, "HNI", 50000000)))
    check("segment boundary: UHNI at 50000001 accepted", accepts(conn, c(12, "UHNI", 50000001)))
    check("segment boundary: Mass Affluent at 2499999 accepted", accepts(conn, c(13, "Mass Affluent", 2499999)))
    check("rejects Mass Affluent at 2500000", rejects(conn, c(20, "Mass Affluent", 2500000)))
    check("rejects HNI at 2499999", rejects(conn, c(21, "HNI", 2499999)))
    check("rejects HNI at 50000001", rejects(conn, c(22, "HNI", 50000001)))
    check("rejects UHNI at 50000000", rejects(conn, c(23, "UHNI", 50000000)))
    check("rejects negative onboarding_aum", rejects(conn, c(24, aum=-1)))
    check("rejects null kyc_status", rejects(conn, c(25, kyc="NULL").replace("'NULL'", "NULL")))
    check("rejects bad kyc_status", rejects(conn, c(26, kyc="unknown")))
    check("rejects orphaned advisor_id", rejects(conn, c(27).replace("VALUES (27, 'C', 1,", "VALUES (27, 'C', 999,")))
    check("rejects closed without closed_date", rejects(conn, c(28, st="closed")))
    check("rejects open with closed_date", rejects(conn, c(29, closed="'2025-06-01'")))
    check("rejects closed_date before onboarding", rejects(conn, c(30, st="closed", closed="'2024-12-31'")))
    check("accepts closed with valid closed_date", accepts(conn, c(31, st="closed", closed="'2025-06-01'")))

    h = "INSERT INTO mart.fact_holdings_monthly VALUES ({c}, {p}, '{d}', {u}, {v})"
    check("holdings valid row accepted", accepts(conn, h.format(c=1, p=1, d="2026-01-31", u=10, v=500000)))
    check("holdings rejects duplicate PK", rejects(conn, h.format(c=1, p=1, d="2026-01-31", u=10, v=500000)))
    check("holdings rejects non-month-end date", rejects(conn, h.format(c=1, p=2, d="2026-01-15", u=10, v=1)))
    check("holdings rejects negative market_value", rejects(conn, h.format(c=1, p=2, d="2026-01-31", u=10, v=-5)))
    check("holdings rejects negative units", rejects(conn, h.format(c=1, p=2, d="2026-01-31", u=-1, v=5)))
    check("holdings rejects orphaned client_id", rejects(conn, h.format(c=999, p=2, d="2026-01-31", u=1, v=5)))
    check("holdings rejects date missing from dim_date", rejects(conn, h.format(c=1, p=2, d="2026-02-28", u=1, v=5)))

    t = "INSERT INTO mart.fact_transactions VALUES ({id}, 1, 1, '2026-01-15', '{tt}', '{ft}', {a})"
    check("txn valid deposit accepted", accepts(conn, t.format(id=1, tt="deposit", ft="external_in", a=1000)))
    check("txn valid switch_out accepted", accepts(conn, t.format(id=2, tt="switch_out", ft="internal", a=1000)))
    check("txn valid redemption accepted", accepts(conn, t.format(id=3, tt="redemption", ft="external_out", a=1000)))
    check("txn rejects duplicate txn_id", rejects(conn, t.format(id=1, tt="deposit", ft="external_in", a=1000)))
    check("txn rejects negative amount", rejects(conn, t.format(id=4, tt="deposit", ft="external_in", a=-1000)))
    check("txn rejects zero amount", rejects(conn, t.format(id=5, tt="deposit", ft="external_in", a=0)))
    check("txn rejects deposit as external_out", rejects(conn, t.format(id=6, tt="deposit", ft="external_out", a=1000)))
    check("txn rejects sip as internal", rejects(conn, t.format(id=7, tt="sip", ft="internal", a=1000)))
    check("txn rejects withdrawal as external_in", rejects(conn, t.format(id=8, tt="withdrawal", ft="external_in", a=1000)))
    check("txn rejects switch_in as external_in", rejects(conn, t.format(id=9, tt="switch_in", ft="external_in", a=1000)))
    check("txn rejects orphaned client_id",
          rejects(conn, "INSERT INTO mart.fact_transactions VALUES (10, 999, 1, '2026-01-15', 'deposit', 'external_in', 5)"))

    i = "INSERT INTO mart.fact_interactions VALUES ({id}, 1, 1, '2026-01-15', '{ch}', '{o}')"
    check("interaction valid row accepted", accepts(conn, i.format(id=1, ch="call", o="connected")))
    check("interaction rejects bad outcome", rejects(conn, i.format(id=2, ch="call", o="busy")))
    check("interaction rejects bad channel", rejects(conn, i.format(id=3, ch="sms", o="connected")))

    r = "INSERT INTO mart.fact_revenue VALUES (1, '{d}', {v})"
    check("revenue valid row accepted", accepts(conn, r.format(d="2026-01-31", v=1200)))
    check("revenue rejects duplicate PK", rejects(conn, r.format(d="2026-01-31", v=1200)))
    check("revenue rejects non-month-end", rejects(conn, r.format(d="2026-01-15", v=1200)))
    check("revenue rejects negative fee", rejects(conn, r.format(d="2026-01-31", v=-1)))

    check("dim_product rejects duplicate name", rejects(conn, "INSERT INTO mart.dim_product VALUES (3, 'P Equity', 'Debt', 'FH', 1)"))
    check("dim_product rejects fee_pct above 5", rejects(conn, "INSERT INTO mart.dim_product VALUES (4, 'X', 'Debt', 'FH', 5.01)"))
    check("dim_product rejects bad asset_class", rejects(conn, "INSERT INTO mart.dim_product VALUES (5, 'Y', 'Crypto', 'FH', 1)"))
    check("dim_date rejects duplicate full_date",
          rejects(conn, "INSERT INTO mart.dim_date VALUES (20260199, '2026-01-31', 2026, 1, 1, 'January', '2026-01-01', '2026-01-31', true)"))

    check("dq_exceptions accepts orphaned/raw record", accepts(conn,
          "INSERT INTO mart.dq_exceptions (source_table, source_key, rule_name, raw_record) "
          "VALUES ('staging.transactions', '999', 'orphaned_client', '{\"client_id\": 999}')"))
    check("dq_exceptions identity is ALWAYS", rejects(conn,
          "INSERT INTO mart.dq_exceptions (exception_id, source_table, rule_name) VALUES (1, 'x', 'y')",
          expect_sqlstate="428"))


    dirty = [
        "INSERT INTO staging.transactions (txn_id, client_id, amount) VALUES (1, 999, -500)",
        "INSERT INTO staging.transactions (txn_id, client_id, amount) VALUES (1, 999, -500)",
        "INSERT INTO staging.clients (client_id, kyc_status) VALUES (1, NULL)",
        "INSERT INTO staging.holdings_monthly (client_id, market_value) VALUES (1, -10)",
    ]
    check("staging accepts duplicate/orphan/negative/null rows", all(accepts(conn, s) for s in dirty))
    n = conn.execute(text("SELECT count(*) FROM staging.transactions WHERE _loaded_at IS NOT NULL")).scalar()
    check("staging _loaded_at defaults to now()", n == 2, f"{n}")


def main() -> int:
    load_dotenv(ROOT / ".env")
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        print("DATABASE_URL is missing or empty.")
        return 1
    engine = create_engine(url, connect_args={"connect_timeout": 15})
    conn = engine.connect()
    trans = conn.begin()
    try:
        structural(conn)
        behavioural(conn)
    finally:
        trans.rollback()
        conn.close()

    failed = results.count(False)
    print(f"\n{len(results) - failed}/{len(results)} checks passed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
