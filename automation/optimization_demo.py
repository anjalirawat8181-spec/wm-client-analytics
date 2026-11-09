"""Measure a monthly roll-up before and after the index in sql/schema/05_performance_indexes.sql.

Usage: python automation/optimization_demo.py
Drops the demo index if present, measures 5 EXPLAIN (ANALYZE, BUFFERS) runs, creates the index, runs ANALYZE, measures 5 more,
and writes docs/query_optimization.md with the real numbers (medians). The index stays in place afterwards.
"""
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import ROOT, connect  # noqa: E402

INDEX = "idx_holdings_snapshot_date"
INDEX_SQL = (ROOT / "sql" / "schema" / "05_performance_indexes.sql").read_text(encoding="utf-8")
RUNS = 5
QUERY = """
SELECT c.segment, p.asset_class,
       count(DISTINCT h.client_id) AS clients,
       sum(h.market_value)         AS aum
FROM mart.fact_holdings_monthly h
JOIN mart.dim_client  c ON c.client_id  = h.client_id
JOIN mart.dim_product p ON p.product_id = h.product_id
WHERE h.snapshot_date = DATE '2026-10-31'
GROUP BY c.segment, p.asset_class
ORDER BY c.segment, p.asset_class
"""


def walk(node, out):
    out.append(node)
    for ch in node.get("Plans", []):
        walk(ch, out)
    return out


def measure(cur):
    runs, nodes_desc, text_plan = [], "", ""
    for i in range(RUNS):
        cur.execute("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + QUERY)
        res = cur.fetchone()[0]
        res = res if isinstance(res, list) else json.loads(res)
        top = res[0]
        plan = top["Plan"]
        nodes = walk(plan, [])
        h = next((n for n in nodes if n.get("Relation Name") == "fact_holdings_monthly"), {})
        runs.append({"exec_ms": top["Execution Time"], "plan_ms": top["Planning Time"],
                     "shared_hit": plan.get("Shared Hit Blocks", 0), "shared_read": plan.get("Shared Read Blocks", 0)})
        nodes_desc = f"{h.get('Node Type', '?')} on {h.get('Index Name', 'table')}" if h else "?"
    cur.execute("EXPLAIN (ANALYZE, BUFFERS) " + QUERY)
    text_plan = "\n".join(r[0] for r in cur.fetchall())
    return runs, nodes_desc, text_plan


def med(runs, k):
    return statistics.median(r[k] for r in runs)


def main() -> int:
    conn = connect()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(f"DROP INDEX IF EXISTS mart.{INDEX}")
    cur.execute("ANALYZE mart.fact_holdings_monthly")
    cur.execute("select count(*) from mart.fact_holdings_monthly")
    total = cur.fetchone()[0]
    cur.execute("select count(*) from mart.fact_holdings_monthly where snapshot_date = DATE '2026-10-31'")
    month_rows = cur.fetchone()[0]
    before, before_node, before_plan = measure(cur)
    cur.execute(INDEX_SQL)
    cur.execute("ANALYZE mart.fact_holdings_monthly")
    cur.execute(f"select pg_relation_size('mart.{INDEX}')/1024.0/1024")
    idx_mb = float(cur.fetchone()[0])
    after, after_node, after_plan = measure(cur)
    conn.close()

    b, a = med(before, "exec_ms"), med(after, "exec_ms")
    note = ("The planner used the new index and execution time fell." if a < b and INDEX in after_node
            else "The planner did NOT use the new index, or it did not help; see the plan below." if INDEX not in after_node
            else "The planner used the index but it did not make the query faster.")
    L = ["# Query Optimisation Demo", "",
         f"Measured by `automation/optimization_demo.py` on {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC, "
         "against the Neon database. Times are the server-side `Execution Time` from `EXPLAIN (ANALYZE, BUFFERS)`, "
         f"{RUNS} runs each, median reported.", "",
         "## The query", "", "A monthly roll-up filtered by `snapshot_date` across all clients (AUM and client count by segment and asset class):", "",
         "```sql" + QUERY.rstrip() + "\n```", "",
         f"`fact_holdings_monthly` holds {total:,} rows; the filtered month holds {month_rows:,} ({100 * month_rows / total:.1f}%).", "",
         "## Why it was slow", "",
         "The primary key is `(client_id, product_id, snapshot_date)`. It starts with `client_id`, so a filter on `snapshot_date` alone "
         "cannot use it and the planner must read the whole table.", "",
         "## The change", "", "```sql\n" + INDEX_SQL.split("\n", 4)[-1].strip() + "\n```", "",
         f"Index size: {idx_mb:.1f} MB.", "",
         "## Result", "", "| | Before | After |", "|---|---:|---:|",
         f"| Median execution time (ms) | {b:.1f} | {a:.1f} |",
         f"| Median planning time (ms) | {med(before, 'plan_ms'):.1f} | {med(after, 'plan_ms'):.1f} |",
         f"| Median shared buffers hit | {med(before, 'shared_hit'):,.0f} | {med(after, 'shared_hit'):,.0f} |",
         f"| Median shared buffers read | {med(before, 'shared_read'):,.0f} | {med(after, 'shared_read'):,.0f} |",
         f"| Scan node on holdings | {before_node} | {after_node} |", "",
         f"Change in median execution time: {100 * (a - b) / b:+.1f}%. {note}", "",
         "All runs (execution ms): before " + ", ".join(f"{r['exec_ms']:.1f}" for r in before) +
         "; after " + ", ".join(f"{r['exec_ms']:.1f}" for r in after) + ".", "",
         "## Plans", "", "Before:", "```\n" + before_plan + "\n```", "", "After:", "```\n" + after_plan + "\n```", "",
         "## Caveats", "",
         "- Server-side times only; they exclude network latency to Neon, which is larger than the query itself.",
         "- The table is small (hundreds of thousands of rows), so absolute gains are small. The index matters more as history grows.",
         "- The first run of each set may read from disk; the median of 5 limits that effect.", ""]
    (ROOT / "docs" / "query_optimization.md").write_text("\n".join(L), encoding="utf-8")
    print(f"before median {b:.1f} ms ({before_node}); after median {a:.1f} ms ({after_node}); index {idx_mb:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
