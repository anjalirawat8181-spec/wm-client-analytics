"""Load output/staging/*.csv into the staging schema (staging only; never touches mart).

Usage:
  python data_generation/load_staging.py --dry-run           # counts and size estimate, no connection
  python data_generation/load_staging.py                     # refuses if any staging table is non-empty
  python data_generation/load_staging.py --truncate-staging  # asks you to type "TRUNCATE staging" first

All seven tables load in ONE transaction (COPY), so a failure leaves staging as it was.
DATABASE_URL is read from .env via python-dotenv and is never printed.
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
STAGING_DIR = HERE / "output" / "staging"
TABLES = ["advisors", "clients", "products", "transactions", "holdings_monthly", "interactions", "revenue"]
SIZE_LIMIT_MB = 400.0
MB = 1024 * 1024


class BatchStream:
    """File-like object: the CSV with a constant _batch_id column appended to every line."""

    def __init__(self, path, batch_id):
        self.f = open(path, "r", encoding="utf-8", newline="")
        self.suffix = "," + batch_id + "\n"
        self.header = True
        self.buf = ""

    def read(self, size=-1):
        while len(self.buf) < max(size, 1):
            line = self.f.readline()
            if not line:
                break
            line = line.rstrip("\r\n")
            self.buf += (line + ",_batch_id\n") if self.header else (line + self.suffix)
            self.header = False
        out, self.buf = self.buf[:size], self.buf[size:]
        return out

    def close(self):
        self.f.close()


def connect_with_retry(url, attempts=3):
    for i in range(1, attempts + 1):
        try:
            return psycopg2.connect(url, connect_timeout=30)
        except Exception as exc:
            print(f"  connection attempt {i}/{attempts} failed ({type(exc).__name__})")
            if i == attempts:
                raise SystemExit("Could not connect to the database. Is the Neon project awake?")
            time.sleep(3 * i)


def counts(cur):
    out = {}
    for t in TABLES:
        cur.execute(f"SELECT count(*) FROM staging.{t}")
        out[t] = cur.fetchone()[0]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--truncate-staging", action="store_true")
    args = ap.parse_args()

    summary = json.loads((HERE / "output" / "run_summary.json").read_text(encoding="utf-8"))
    expected = summary["row_counts"]["staging"]
    est_mb = float(summary["estimated_staging_size_mb"])
    seed = summary["seed"]
    print(f"Expected staging rows (run_summary.json), seed {seed}:")
    for t in TABLES:
        print(f"  {t:18s}{expected[t]:>10,}")
    print(f"  {'TOTAL':18s}{sum(expected.values()):>10,}")
    print(f"Estimated staging size: {est_mb:.1f} MB")
    if args.dry_run:
        print("Dry run: no connection made.")
        return 0

    load_dotenv(ROOT / ".env")
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        print("DATABASE_URL is missing or empty.")
        return 1
    conn = connect_with_retry(url)
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("SELECT pg_database_size(current_database())")
    db_mb = cur.fetchone()[0] / MB
    print(f"Current database size: {db_mb:.1f} MB; estimated staging: {est_mb:.1f} MB; "
          f"projected {db_mb + est_mb:.1f} MB (limit {SIZE_LIMIT_MB:.0f} MB)")
    if db_mb + est_mb > SIZE_LIMIT_MB:
        print("REFUSING to load: projected size exceeds the limit.")
        return 1

    existing = counts(cur)
    nonempty = {t: n for t, n in existing.items() if n}
    if nonempty and not args.truncate_staging:
        print("REFUSING to load: staging tables are not empty: " + ", ".join(f"{t}={n:,}" for t, n in nonempty.items()))
        print("Re-run with --truncate-staging to replace them.")
        return 1
    if args.truncate_staging:
        if input('Type exactly "TRUNCATE staging" to empty the 7 staging tables first: ') != "TRUNCATE staging":
            print("Confirmation text did not match. Nothing changed.")
            return 1

    batch_id = f"gen_seed{seed}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    print(f"Loading with _batch_id = {batch_id}")
    try:
        if args.truncate_staging:
            cur.execute("TRUNCATE " + ", ".join(f"staging.{t}" for t in TABLES))
        for t in TABLES:
            path = STAGING_DIR / f"{t}.csv"
            cols = path.open(encoding="utf-8").readline().strip().split(",")
            t0 = time.time()
            stream = BatchStream(path, batch_id)
            try:
                cur.copy_expert(
                    f"COPY staging.{t} ({', '.join(cols)}, _batch_id) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')",
                    stream, 1 << 20)
            finally:
                stream.close()
            print(f"  loaded {t:18s}{cur.rowcount:>10,} rows in {time.time() - t0:5.1f}s")
        conn.commit()
    except Exception as exc:
        conn.rollback()
        print(f"LOAD FAILED and was rolled back ({type(exc).__name__}: {str(exc).splitlines()[0][:200]})")
        return 1

    print("\nRow count check against run_summary.json:")
    got = counts(cur)
    bad = 0
    for t in TABLES:
        ok = got[t] == expected[t]
        bad += not ok
        print(f"  [{'PASS' if ok else 'FAIL'}] {t:18s} staging={got[t]:,} expected={expected[t]:,}")
    conn.commit()

    conn.autocommit = True
    for t in TABLES:
        cur.execute(f"ANALYZE staging.{t}")
    print("\nANALYZE done. Sizes:")
    for t in TABLES:
        cur.execute("SELECT pg_total_relation_size(%s)", (f"staging.{t}",))
        print(f"  staging.{t:18s}{cur.fetchone()[0] / MB:8.1f} MB")
    cur.execute("SELECT pg_database_size(current_database())")
    print(f"Total database size: {cur.fetchone()[0] / MB:.1f} MB")
    conn.close()
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
