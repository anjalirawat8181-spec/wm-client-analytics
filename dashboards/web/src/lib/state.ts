import { createContext, useContext, useEffect, useState } from "react";
import type { Filters } from "./types";

export type Theme = "dark" | "light";

export interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}
export const ThemeContext = createContext<ThemeCtx>({ theme: "dark", toggle: () => undefined });
export const useTheme = () => useContext(ThemeContext);

export interface FilterCtx {
  filters: Filters;
  setFilters: (f: Filters) => void;
  months: string[]; // all month-end dates available
  branches: string[];
  ready: boolean;
}
export const FilterContext = createContext<FilterCtx>({
  filters: { segment: "All", branch: "All", from: "", to: "" },
  setFilters: () => undefined,
  months: [],
  branches: [],
  ready: false,
});
export const useFilters = () => useContext(FilterContext);

/** True when the user asked the OS to reduce motion. Charts switch their mount animation off. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
