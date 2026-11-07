"""Apply sql/schema/*.sql to the Neon database, in filename order.

Usage:
    python automation/apply_schema.py            # apply; aborts if staging/mart tables exist
    python automation/apply_schema.py --reset    # DROP SCHEMA staging, mart CASCADE first

Each run is one transaction: all files apply, or none do.
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = ROOT / "sql" / "schema"


def main() -> int:
    load_dotenv(ROOT / ".env")
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        print("DATABASE_URL is missing or empty.")
        return 1

    reset = "--reset" in sys.argv[1:]
    files = sorted(SCHEMA_DIR.glob("[0-9][0-9]_*.sql"))
    if not files:
        print(f"No SQL files found in {SCHEMA_DIR}")
        return 1

    engine = create_engine(url, connect_args={"connect_timeout": 15})
    try:
        with engine.begin() as conn:
            if reset:
                conn.execute(text("DROP SCHEMA IF EXISTS staging, mart CASCADE"))
                print("Dropped schemas staging and mart (--reset).")
            else:
                n = conn.execute(text(
                    "SELECT count(*) FROM information_schema.tables "
                    "WHERE table_schema IN ('staging', 'mart')"
                )).scalar()
                if n:
                    print(f"{n} tables already exist in staging/mart. Use --reset to rebuild.")
                    return 1
            for f in files:
                conn.exec_driver_sql(f.read_text(encoding="utf-8"))
                print(f"Applied {f.name}")
    except Exception as exc:
        print(f"Failed, transaction rolled back. Error type: {type(exc).__name__}")
        print(str(getattr(exc, "orig", exc)).splitlines()[0])
        return 1

    print("Schema applied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
