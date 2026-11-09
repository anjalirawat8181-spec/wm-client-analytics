"""Refresh everything downstream of the mart: views, data quality report, validation, dashboard data and the Excel report.

Usage: python automation/refresh_pipeline.py
Runs the steps in order, logs each to reports/run_log.jsonl, stops with a non-zero exit code on the first failure.
It never reloads or modifies mart facts: the only writes are the analytics views (dropped and recreated) and local files.
"""
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import ROOT, connect  # noqa: E402

AUTOMATION = ROOT / "automation"
LOG = ROOT / "reports" / "run_log.jsonl"
STEPS = [
    ("apply_analytics", "apply_analytics.py"),
    ("dq_report", "dq_report.py"),
    ("validate_analytics", "validate_analytics.py"),
    ("export_dashboard_data", "export_dashboard_data.py"),
    ("build_weekly_report", "build_weekly_report.py"),
]


def log(entry):
    LOG.parent.mkdir(exist_ok=True)
    entry["at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def main() -> int:
    t_all = time.time()
    t0 = time.time()
    conn = connect(retries=3, wait=10)  # Neon free projects auto-suspend; this wakes the database and retries
    cur = conn.cursor()
    cur.execute("select count(*) from mart.dim_client")
    clients = cur.fetchone()[0]
    conn.close()
    if clients == 0:
        log({"step": "connect", "status": "failed", "detail": "mart is empty"})
        print("The mart is empty: run the ETL first (automation/run_etl.py). The pipeline does not load data.")
        return 1
    log({"step": "connect", "status": "ok", "seconds": round(time.time() - t0, 1)})
    print(f"connected; mart holds {clients:,} clients")

    for name, script in STEPS:
        t0 = time.time()
        print(f"--- {name}", flush=True)
        p = subprocess.run([sys.executable, str(AUTOMATION / script)], cwd=ROOT, text=True, capture_output=True)
        out = (p.stdout or "") + (p.stderr or "")
        tail = "\n".join(out.strip().splitlines()[-6:])
        print(tail, flush=True)
        secs = round(time.time() - t0, 1)
        if p.returncode != 0:
            log({"step": name, "status": "failed", "returncode": p.returncode, "seconds": secs})
            print(f"FAILED: {name} (exit code {p.returncode})")
            return p.returncode or 1
        log({"step": name, "status": "ok", "seconds": secs})
    total = round(time.time() - t_all, 1)
    log({"step": "pipeline", "status": "ok", "seconds": total})
    print(f"pipeline finished in {total}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
