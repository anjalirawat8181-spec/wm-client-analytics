import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, AlertTriangle, Inbox } from "lucide-react";
import { computeDelta, tone } from "../lib/kpi";
import { formatPct } from "../lib/format";

export function Card({ title, subtitle, children, className = "", action }: {
  title?: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode;
}) {
  return (
    <section className={`card min-w-0 p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Skeleton({ className = "h-40" }: { className?: string }) {
  return <div className={`skeleton w-full ${className}`} aria-hidden="true" />;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-neg/40 bg-surface2 p-4 text-sm">
      <AlertTriangle className="h-5 w-5 shrink-0 text-neg" aria-hidden="true" />
      <div>
        <p className="font-semibold text-ink">Could not load data</p>
        <p className="text-muted">{message}</p>
      </div>
    </div>
  );
}

export function EmptyState({ message = "No data for the selected filters." }: { message?: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted">
      <Inbox className="h-6 w-6" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export function PageHeader({ title, takeaway }: { title: string; takeaway: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted" data-testid="takeaway">{takeaway}</p>
    </header>
  );
}

export function Footnote({ children }: { children: ReactNode }) {
  return <p className="mt-6 max-w-4xl border-t border-line pt-3 text-xs leading-relaxed text-muted">{children}</p>;
}

/** Delta pill: arrow AND sign AND colour, so meaning never relies on colour alone. */
export function DeltaPill({ current, prior, goodWhen = "up", mode = "relative" }: {
  current: number | null; prior: number | null; goodWhen?: "up" | "down"; mode?: "relative" | "points";
}) {
  const d = computeDelta(current, prior);
  if (d.direction === "none") return <span className="text-xs text-muted">no prior month</span>;
  const t = tone(d.direction, goodWhen);
  const color = t === "good" ? "text-pos" : t === "bad" ? "text-neg" : "text-muted";
  const Icon = d.direction === "up" ? ArrowUpRight : d.direction === "down" ? ArrowDownRight : Minus;
  const sign = d.direction === "up" ? "+" : d.direction === "down" ? "-" : "";
  const text = mode === "points"
    ? `${sign}${Math.abs((d.abs ?? 0) * 100).toFixed(2)} pts`
    : d.pct === null ? "n/a" : `${sign}${formatPct(Math.abs(d.pct), Math.abs(d.pct) < 0.001 ? 2 : 1)}`;
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full border border-line bg-surface2 px-2 py-0.5 text-xs font-semibold num ${color}`}
      aria-label={`${d.direction === "up" ? "up" : d.direction === "down" ? "down" : "unchanged"} ${text} versus prior month`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {text}
    </span>
  );
}

export function Sparkline({ values, color = "var(--gold)" }: { values: (number | null)[]; color?: string }) {
  const v = values.filter((x): x is number => x !== null);
  if (v.length < 2) return null;
  const w = 96, h = 28, min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${h - 3 - ((x - min) / span) * (h - 6)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Trend over the last ${v.length} months`} className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KpiTile({ label, value, current, prior, goodWhen = "up", mode = "relative", series, hint }: {
  label: string; value: string; current: number | null; prior: number | null; goodWhen?: "up" | "down";
  mode?: "relative" | "points"; series: (number | null)[]; hint?: string;
}) {
  return (
    <div className="card flex flex-col justify-between gap-3 p-4" data-testid="kpi-tile">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="num mt-1 text-2xl font-bold leading-tight text-ink sm:text-[26px]">{value}</p>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <DeltaPill current={current} prior={prior} goodWhen={goodWhen} mode={mode} />
          {hint && <span className="text-[11px] text-muted">{hint}</span>}
        </div>
        <Sparkline values={series} />
      </div>
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="chip">{children}</span>;
}

export function Badge({ tone: t, children }: { tone: "gold" | "pos" | "neg" | "muted"; children: ReactNode }) {
  const cls = t === "gold" ? "text-gold2 border-gold/50" : t === "pos" ? "text-pos border-pos/50" : t === "neg" ? "text-neg border-neg/50" : "text-muted border-line";
  return <span className={`inline-block rounded-full border bg-surface2 px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}
