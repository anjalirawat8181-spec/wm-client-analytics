import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Suspense, useEffect } from "react";
import { Gauge, HeartPulse, Moon, ShieldCheck, Sun, Users, BookOpen } from "lucide-react";
import { useFilters, useTheme } from "../lib/state";
import { useJson } from "../lib/data";
import { formatMonth } from "../lib/format";
import type { Meta, Segment } from "../lib/types";
import { SEGMENTS } from "../lib/types";
import { Skeleton } from "./ui";

const PAGES = [
  { to: "/", label: "Executive", icon: Gauge },
  { to: "/client-health", label: "Client Health", icon: HeartPulse },
  { to: "/advisors", label: "Advisors", icon: Users },
  { to: "/data-quality", label: "Data Quality", icon: ShieldCheck },
  { to: "/methodology", label: "Methodology", icon: BookOpen },
] as const;

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--surface2)" stroke="var(--border)" />
        <path d="M14 44 L26 28 L36 38 L50 18" fill="none" stroke="var(--gold)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="50" cy="18" r="4" fill="var(--gold-hi)" />
      </svg>
      <div className="hidden leading-tight lg:block">
        <p className="text-sm font-bold tracking-tight text-ink">Wealth Analytics</p>
        <p className="text-[11px] text-muted">Client insights</p>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-line bg-surface px-3 py-5 md:flex lg:w-60">
      <Logo />
      <nav aria-label="Pages" className="mt-8 flex flex-col gap-1">
        {PAGES.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} aria-label={label}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-surface2 text-gold2" : "text-muted hover:bg-surface2 hover:text-ink"}`}>
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">{label}</span>
          </NavLink>
        ))}
      </nav>
      <p className="mt-auto hidden text-[11px] leading-snug text-muted lg:block">Synthetic data. No real clients.</p>
    </aside>
  );
}

function BottomTabs() {
  return (
    <nav aria-label="Pages" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface md:hidden">
      {PAGES.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === "/"}
          className={({ isActive }) => `flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium ${isActive ? "text-gold2" : "text-muted"}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span className="max-w-full truncate">{label.replace("Client Health", "Clients").replace("Data Quality", "Quality").replace("Methodology", "Method")}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function TopBar() {
  const { theme, toggle } = useTheme();
  const { filters, setFilters, months, branches, ready } = useFilters();
  const meta = useJson<Meta>("meta");
  const asOf = meta.data?.data_window.last_month_end;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <div className="mr-auto flex items-center gap-2 md:hidden"><Logo /></div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center" role="group" aria-label="Filters">
          <label className="flex flex-col text-[11px] text-muted sm:flex-row sm:items-center sm:gap-1.5">Segment
            <select aria-label="Segment" value={filters.segment} disabled={!ready}
              onChange={(e) => setFilters({ ...filters, segment: e.target.value as "All" | Segment })}>
              <option value="All">All segments</option>
              {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-[11px] text-muted sm:flex-row sm:items-center sm:gap-1.5">Branch
            <select aria-label="Branch" value={filters.branch} disabled={!ready}
              onChange={(e) => setFilters({ ...filters, branch: e.target.value })}>
              <option value="All">All branches</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-[11px] text-muted sm:flex-row sm:items-center sm:gap-1.5">From
            <select aria-label="From month" value={filters.from} disabled={!ready}
              onChange={(e) => setFilters({ ...filters, from: e.target.value, to: e.target.value > filters.to ? e.target.value : filters.to })}>
              {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-[11px] text-muted sm:flex-row sm:items-center sm:gap-1.5">To
            <select aria-label="To month" value={filters.to} disabled={!ready}
              onChange={(e) => setFilters({ ...filters, to: e.target.value, from: e.target.value < filters.from ? e.target.value : filters.from })}>
              {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
            </select>
          </label>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {asOf && (
            <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted" data-testid="asof">
              Data as of <span className="text-gold2">{formatMonth(asOf)}</span>
            </span>
          )}
          <button type="button" onClick={toggle} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="rounded-full border border-line bg-surface p-2 text-muted hover:text-ink">
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
}

export function Shell() {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [loc.pathname]);
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <Sidebar />
      <div className="md:pl-[72px] lg:pl-60">
        <TopBar />
        <main id="main" tabIndex={-1} className="mx-auto max-w-[1280px] px-4 pb-24 pt-5 outline-none sm:px-6 md:pb-10">
          <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-40" /><Skeleton className="h-72" /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <BottomTabs />
    </div>
  );
}

