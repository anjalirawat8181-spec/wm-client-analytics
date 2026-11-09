import os
import time
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

def get_url() -> str:
    load_dotenv(ROOT / ".env")
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise SystemExit("DATABASE_URL is missing or empty (set it in .env locally or as a CI secret).")
    return url

def connect(retries: int = 3, wait: float = 5.0):
    url = get_url()
    last = None
    for attempt in range(1, retries + 1):
        try:
            return psycopg2.connect(url, connect_timeout=30)
        except psycopg2.OperationalError as exc:
            last = type(exc).__name__
            print(f"  connection attempt {attempt}/{retries} failed ({last})", flush=True)
            time.sleep(wait * attempt)
    raise SystemExit(f"Could not connect to the database after {retries} attempts ({last}).")

def db_size_mb(cur) -> float:
    cur.execute("select pg_database_size(current_database())/1024.0/1024")
    return float(cur.fetchone()[0])
