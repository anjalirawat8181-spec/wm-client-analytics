import { useEffect, useRef, useState, type ReactNode } from "react";

export const SEGMENT_COLORS: Record<string, string> = {
  "Mass Affluent": "var(--c1)",
  HNI: "var(--c2)",
  UHNI: "var(--c3)",
  All: "var(--text)",
};
export const ASSET_COLORS: Record<string, string> = {
  Equity: "var(--c1)",
  Debt: "var(--c2)",
  Hybrid: "var(--c3)",
  Gold: "var(--c4)",
  Alternatives: "var(--c5)",
  Cash: "var(--c6)",
};
export const RISK_COLORS: Record<string, string> = { High: "var(--negative)", Medium: "var(--c4)", Low: "var(--positive)" };

export const AXIS = { stroke: "var(--border)", tickLine: false, axisLine: { stroke: "var(--border)" } } as const;
export const GRID = { stroke: "var(--border)", strokeDasharray: "3 3", vertical: false, opacity: 0.6 } as const;

/** Series visibility toggled from a legend of buttons (keyboard accessible, unlike the default legend). */
export function useSeriesToggle(keys: string[]) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(k)) n.delete(k);
      else if (keys.length - n.size > 1) n.add(k); // always keep one series visible
      return n;
    });
  return { hidden, toggle, isOn: (k: string) => !hidden.has(k) };
}

export function ToggleLegend({ items, isOn, toggle }: {
  items: { key: string; label: string; color: string }[]; isOn: (k: string) => boolean; toggle: (k: string) => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1" role="group" aria-label="Chart series">
      {items.map((it) => (
        <button key={it.key} type="button" aria-pressed={isOn(it.key)} onClick={() => toggle(it.key)}
          className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs ${isOn(it.key) ? "text-ink" : "text-muted line-through opacity-60"}`}>
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} aria-hidden="true" />
          {it.label}
        </button>
      ))}
    </div>
  );
}

export interface TipRow {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}
export function ChartTooltip({ active, payload, label, format, labelFormat }: {
  active?: boolean; payload?: TipRow[]; label?: string | number;
  format: (v: number, key: string) => string; labelFormat?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <p className="mb-1 font-semibold text-ink">{labelFormat ? labelFormat(String(label)) : String(label)}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-muted">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          <span>{p.name}</span>
          <span className="num ml-auto pl-3 font-semibold text-ink">{typeof p.value === "number" ? format(p.value, String(p.dataKey ?? "")) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Charts mount only when they are near the viewport, so the first paint does not pay for charts below the fold. */
export function ChartFrame({ label, height = 280, children }: { label: string; height?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (visible || !el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return (
    <div ref={ref} role="img" aria-label={label} style={{ height }} className="w-full">
      {visible ? children : <div className="skeleton h-full w-full" aria-hidden="true" />}
    </div>
  );
}
