import type { ReactNode } from "react";
import { computeDelta, tone } from "../lib/kpi";
import { formatPct } from "../lib/format";
import { Sparkline } from "./charts";

export function Panel({ title, subtitle, children, className = "", action }: { title?: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`panel min-w-0 p-5 sm:p-7 ${className}`}>
      {(title || action) && (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-medium text-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-[13px] leading-snug text-muted">{subtitle}</p>}
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
    <div role="alert" className="panel p-6 text-sm">
      <p className="font-medium text-ink">Could not load data</p>
      <p className="mt-1 text-muted">{message}</p>
    </div>
  );
}

export function EmptyState({ message = "No data for the selected filters." }: { message?: string }) {
  return <p className="py-12 text-center text-sm text-muted">{message}</p>;
}

export function PageHeader({ title, takeaway }: { title: string; takeaway: ReactNode }) {
  return (
    <header className="mb-8 max-w-3xl">
      <h1 className="text-[28px] font-medium tracking-tight text-ink sm:text-[32px]">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted" data-testid="takeaway">
        {takeaway}
      </p>
    </header>
  );
}

export function Footnote({ children }: { children: ReactNode }) {
  return <p className="mt-10 max-w-3xl text-xs leading-relaxed text-muted">{children}</p>;
}

export function Delta({ current, prior, goodWhen = "up", mode = "relative" }: { current: number | null; prior: number | null; goodWhen?: "up" | "down"; mode?: "relative" | "points" }) {
  const d = computeDelta(current, prior);
  if (d.direction === "none") return <span className="text-xs text-muted">no prior month</span>;
  const t = tone(d.direction, goodWhen);
  const color = t === "good" ? "text-pos" : t === "bad" ? "text-neg" : "text-muted";
  const sign = d.direction === "up" ? "+" : d.direction === "down" ? "-" : "";
  const text = mode === "points" ? `${sign}${Math.abs((d.abs ?? 0) * 100).toFixed(2)} pts` : d.pct === null ? "n/a" : `${sign}${formatPct(Math.abs(d.pct), Math.abs(d.pct) < 0.001 ? 2 : 1)}`;
  const word = d.direction === "up" ? "up" : d.direction === "down" ? "down" : "unchanged";
  return (
    <span className={`num inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${color}`} aria-label={`${word} ${text} versus prior month`}>
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
        {d.direction === "up" && <path d="M4 1l3.2 5.5H0.8z" fill="currentColor" />}
        {d.direction === "down" && <path d="M4 7L0.8 1.5h6.4z" fill="currentColor" />}
        {d.direction === "flat" && <path d="M1 4h6" stroke="currentColor" strokeWidth="1.5" />}
      </svg>
      {text}
    </span>
  );
}

export function Stat({ label, value, current, prior, goodWhen = "up", mode = "relative", series, hint }: { label: string; value: string; current: number | null; prior: number | null; goodWhen?: "up" | "down"; mode?: "relative" | "points"; series: (number | null)[]; hint?: string }) {
  return (
    <div className="min-w-0 py-1" data-testid="kpi-tile">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="display mt-1 text-[28px] leading-tight text-ink">{value}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="flex flex-col">
          <Delta current={current} prior={prior} goodWhen={goodWhen} mode={mode} />
          {hint && <span className="mt-0.5 text-[11px] text-muted">{hint}</span>}
        </span>
        <Sparkline values={series} color="var(--grey-1)" />
      </div>
    </div>
  );
}

export function Tag({ children, tone: t = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "neg" }) {
  const cls = t === "accent" ? "text-accent" : t === "neg" ? "text-neg" : "text-muted";
  return <span className={`inline-block text-xs font-medium ${cls}`}>{children}</span>;
}
