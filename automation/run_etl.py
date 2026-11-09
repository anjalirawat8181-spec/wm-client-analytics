import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import ROOT, connect, db_size_mb

ETL_DIR = ROOT / "sql" / "etl"
DIM_DATE_SQL = ROOT / "sql" / "schema" / "04_populate_dim_date.sql"
LIMIT_MB = 400.0
CONFIRM = "REBUILD mart"
MART_TABLES = ["dim_advisor", "dim_product", "dim_client", "fact_holdings_monthly",
               "fact_transactions", "fact_interactions", "fact_revenue", "dq_exceptions"]

def counts(cur, schema, tables):
    out = {}
    for t in tables:
        cur.execute(f"select count(*) from {schema}.{t}")
        out[t] = cur.fetchone()[0]
    return out

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--confirm-rebuild", default=None, help='must be exactly "REBUILD mart"')
    args = ap.parse_args()
    if args.confirm_rebuild is not None and args.confirm_rebuild != CONFIRM:
        print(f'--confirm-rebuild must be exactly "{CONFIRM}".')
        return 1

    conn = connect()
    conn.autocommit = False
    cur = conn.cursor()
    t_all = time.time()
    try:
        size = db_size_mb(cur)
        cur.execute("select coalesce(sum(pg_total_relation_size(c.oid)),0)/1024.0/1024 from pg_class c "
                    "join pg_namespace n on n.oid=c.relnamespace where n.nspname='staging' and c.relkind='r'")
        staging_mb = float(cur.fetchone()[0])
        projected = size + staging_mb
        print(f"Database size: {size:.1f} MB; staging {staging_mb:.1f} MB; projected after load <= {projected:.1f} MB (limit {LIMIT_MB:.0f})")
        if projected > LIMIT_MB:
            print("STOP: projected size exceeds the limit.")
            return 2

        stg = counts(cur, "staging", ["advisors", "clients", "products", "transactions",
                                      "holdings_monthly", "interactions", "revenue"])
        print("Staging rows:", stg)

        cur.execute(DIM_DATE_SQL.read_text(encoding="utf-8"))
        cur.execute("select count(*) from mart.dim_date")
        print("dim_date rows:", cur.fetchone()[0])

        mart = counts(cur, "mart", MART_TABLES)
        if any(mart.values()):
            if args.confirm_rebuild != CONFIRM:
                print(f'Mart already holds data {mart}. Re-run with --confirm-rebuild "{CONFIRM}" to rebuild.')
                conn.rollback()
                return 3
            cur.execute("TRUNCATE " + ", ".join(f"mart.{t}" for t in MART_TABLES) + " RESTART IDENTITY")
            print("Mart truncated (dim_date kept).")

        for f in sorted(ETL_DIR.glob("[0-9][0-9]_*.sql")):
            t0 = time.time()
            cur.execute(f.read_text(encoding="utf-8"))
            print(f"  ran {f.name:32s} {time.time() - t0:6.1f}s", flush=True)

        mart = counts(cur, "mart", MART_TABLES)
        print("Mart rows:", mart)
        cur.execute("select source_table, rule_name, count(*) from mart.dq_exceptions group by 1,2 order by 1,2")
        for r in cur.fetchall():
            print(f"  exception {r[0]:18s} {r[1]:28s} {r[2]:>8,}")

        if args.dry_run:
            conn.rollback()
            print("DRY RUN: rolled back, nothing persisted.")
        else:
            conn.commit()
            conn.autocommit = True
            cur = conn.cursor()
            for t in MART_TABLES:
                cur.execute(f"ANALYZE mart.{t}")
            print(f"Committed and analysed. Database size now {db_size_mb(cur):.1f} MB")
        print(f"Total {time.time() - t_all:.1f}s")
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"ETL failed, rolled back: {type(exc).__name__}: {str(exc).splitlines()[0]}")
        return 1
    finally:
        conn.close()

if __name__ == "__main__":
    sys.exit(main())
