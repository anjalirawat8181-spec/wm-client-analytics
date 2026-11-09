import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import ROOT, connect

SQL_DIR = ROOT / "sql" / "analytics"

def apply(conn=None, verbose=True) -> int:
    own = conn is None
    conn = conn or connect()
    cur = conn.cursor()
    files = sorted(SQL_DIR.glob("[0-9][0-9]_*.sql"))
    if not files:
        print(f"No SQL files in {SQL_DIR}")
        return 1
    try:
        cur.execute("DROP SCHEMA IF EXISTS analytics CASCADE")
        cur.execute("CREATE SCHEMA analytics")
        cur.execute("COMMENT ON SCHEMA analytics IS 'Documented KPI views over the mart. Read-only, no stored data.'")
        for f in files:
            t0 = time.time()
            cur.execute(f.read_text(encoding="utf-8"))
            if verbose:
                print(f"  applied {f.name:50s} {time.time() - t0:5.2f}s", flush=True)
        conn.commit()
        cur.execute("select count(*) from information_schema.views where table_schema='analytics'")
        print(f"analytics views: {cur.fetchone()[0]}")
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"apply_analytics failed, rolled back: {type(exc).__name__}: {str(exc).splitlines()[0]}")
        return 1
    finally:
        if own:
            conn.close()

if __name__ == "__main__":
    sys.exit(apply())
