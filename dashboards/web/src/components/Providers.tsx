import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FilterContext, ThemeContext, type Theme } from "../lib/state";
import { safeGet, safeSet } from "../lib/env";
import { loadJson } from "../lib/data";
import type { CubeRow, Filters } from "../lib/types";
import { uniqueSorted } from "../lib/kpi";

function initialTheme(): Theme {
  const saved = safeGet("wm-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", theme === "dark" ? "#0B1020" : "#F4F6FB");
  }, [theme]);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      safeSet("wm-theme", next);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>({ segment: "All", branch: "All", from: "", to: "" });
  const [months, setMonths] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadJson<CubeRow[]>("monthly_cube")
      .then((cube) => {
        if (!alive) return;
        const m = uniqueSorted(cube.map((r) => r.snapshot_date));
        setMonths(m);
        setBranches(uniqueSorted(cube.map((r) => r.branch)));
        setFilters((f) => ({ ...f, from: m[0] ?? "", to: m[m.length - 1] ?? "" }));
        setReady(true);
      })
      .catch(() => alive && setReady(false));
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo(() => ({ filters, setFilters, months, branches, ready }), [filters, months, branches, ready]);
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}
