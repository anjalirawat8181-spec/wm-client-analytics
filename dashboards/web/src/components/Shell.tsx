import { Suspense, useEffect, type ReactNode } from "react";
import { useFilters, useTheme } from "../lib/state";
import { useJson } from "../lib/data";
import { useHashRoute } from "../lib/router";
import { formatMonth } from "../lib/format";
import type { Meta, Segment } from "../lib/types";
import { SEGMENTS } from "../lib/types";
import { Skeleton } from "./ui";
import { IconAdvisors, IconClients, IconMethod, IconMoon, IconOverview, IconQuality, IconSun } from "./icons";

export const PAGES = [
  { to: "/", label: "Executive", short: "Executive", icon: IconOverview },
  { to: "/client-health", label: "Client health", short: "Clients", icon: IconClients },
  { to: "/advisors", label: "Advisors", short: "Advisors", icon: IconAdvisors },
  { to: "/data-quality", label: "Data quality", short: "Quality", icon: IconQuality },
  { to: "/methodology", label: "Methodology", short: "Method", icon: IconMethod },
] as const;

function Sidebar({ route }: { route: string }) {
  return (
    <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-52 flex-col border-r hair px-5 py-7 md:flex">
      <a href="#/" className="text-[17px] font-medium tracking-tight text-ink">
        WM Analytics
      </a>
      <nav aria-label="Pages" className="mt-10 flex flex-col gap-0.5">
        {PAGES.map(({ to, label }) => {
          const active = route === to;
          return (
            <a key={to} href={`#${to}`} aria-current={active ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm ${active ? "bg-[var(--line)] font-medium text-accent" : "text-muted hover:text-ink"}`}>
              {label}
            </a>
          );
        })}
      </nav>
      <p className="mt-auto text-xs leading-snug text-muted">All data is synthetic.</p>
    </aside>
  );
}

function BottomTabs({ route }: { route: string }) {
  return (
    <nav aria-label="Pages" className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t hair pb-[env(safe-area-inset-bottom)] md:hidden">
      {PAGES.map(({ to, short, icon: Icon }) => {
        const active = route === to;
        return (
          <a key={to} href={`#${to}`} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] ${active ? "font-medium text-accent" : "text-muted"}`}>
            <Icon />
            {short}
          </a>
        );
      })}
    </nav>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1 text-xs text-muted">
      <span className="sr-only sm:not-sr-only">{label}</span>
      {children}
    </label>
  );
}

function TopBar() {
  const { theme, toggle } = useTheme();
  const { filters, setFilters, months, branches, ready } = useFilters();
  const meta = useJson<Meta>("meta");
  const asOf = meta.data?.data_window.last_month_end;
  return (
    <header className="glass sticky top-0 z-20 border-b hair">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-8">
        <a href="#/" className="mr-auto text-[15px] font-medium text-ink md:hidden">
          WM Analytics
        </a>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1" role="group" aria-label="Filters">
          <Field label="Segment">
            <select aria-label="Segment" value={filters.segment} disabled={!ready} onChange={(e) => setFilters({ ...filters, segment: e.target.value as "All" | Segment })}>
              <option value="All">All segments</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Branch">
            <select aria-label="Branch" value={filters.branch} disabled={!ready} onChange={(e) => setFilters({ ...filters, branch: e.target.value })}>
              <option value="All">All branches</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <select aria-label="From month" value={filters.from} disabled={!ready} onChange={(e) => setFilters({ ...filters, from: e.target.value, to: e.target.value > filters.to ? e.target.value : filters.to })}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To">
            <select aria-label="To month" value={filters.to} disabled={!ready} onChange={(e) => setFilters({ ...filters, to: e.target.value, from: e.target.value < filters.from ? e.target.value : filters.from })}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {asOf && (
            <span className="hidden text-xs text-muted sm:inline" data-testid="asof">
              Data as of {formatMonth(asOf)}
            </span>
          )}
          <button type="button" onClick={toggle} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} className="rounded-full p-2 text-muted hover:text-ink">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </div>
    </header>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const route = useHashRoute();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [route]);
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--raised)] focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar route={route} />
      <div className="md:pl-52">
        <TopBar />
        <main id="main" tabIndex={-1} className="mx-auto max-w-[1120px] px-4 pb-28 pt-8 outline-none sm:px-8 md:pb-16 md:pt-12">
          <Suspense
            fallback={
              <div className="space-y-6">
                <Skeleton className="h-12 w-1/2" />
                <Skeleton className="h-72" />
              </div>
            }
          >
            {children}
          </Suspense>
        </main>
      </div>
      <BottomTabs route={route} />
    </div>
  );
}
