import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { linePath, linearScale, nearestIndex, niceTicks, spreadLabels } from "../lib/geometry";

export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function Reveal({ height, children }: { height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (visible || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return (
    <div ref={ref} style={{ minHeight: height }}>
      {visible ? children : <div className="skeleton w-full" style={{ height }} aria-hidden="true" />}
    </div>
  );
}

export interface Series {
  key: string;
  name: string;
  color: string;
  width?: number;
}

interface TipState {
  index: number;
  x: number;
}

function Tooltip({ x, width, title, rows }: { x: number; width: number; title: string; rows: { name: string; value: string; color: string }[] }) {
  const left = Math.min(Math.max(x, 80), Math.max(width - 80, 80));
  return (
    <div className="floating pointer-events-none absolute top-0 z-10 -translate-x-1/2 px-3 py-2 text-xs" style={{ left }} role="status">
      <p className="mb-1 font-medium text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2 text-muted">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} aria-hidden="true" />
          <span>{r.name}</span>
          <span className="num ml-auto pl-3 font-medium text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

function useCursor(count: number, xs: number[]) {
  const [tip, setTip] = useState<TipState | null>(null);
  const onMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const box = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - box.left;
      const i = nearestIndex(px, xs);
      setTip({ index: i, x: xs[i] ?? px });
    },
    [xs],
  );
  const onKey = useCallback(
    (e: KeyboardEvent<SVGSVGElement>) => {
      if (e.key === "Escape") return setTip(null);
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const cur = tip ? tip.index : e.key === "ArrowLeft" ? count : -1;
      const next = Math.min(count - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1)));
      setTip({ index: next, x: xs[next] ?? 0 });
    },
    [count, tip, xs],
  );
  return { tip, setTip, onMove, onKey };
}

export function LineChart({ label, data, series, height = 240, yFormat, tipFormat, xLabel, xTitle, zeroBased = false, right = 96 }: {
  label: string;
  data: Record<string, string | number | null>[];
  series: Series[];
  height?: number;
  yFormat: (v: number) => string;
  tipFormat: (v: number) => string;
  xLabel: (x: string) => string;
  xTitle: (x: string) => string;
  zeroBased?: boolean;
  right?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const w = Math.max(width, 0);
  const narrow = w > 0 && w < 520;
  const m = { t: 10, r: narrow ? 12 : right, b: 24, l: narrow ? 60 : 66 };
  const n = data.length;
  const xs = data.map((_, i) => m.l + (n <= 1 ? 0 : (i / (n - 1)) * Math.max(w - m.l - m.r, 1)));
  const { tip, setTip, onMove, onKey } = useCursor(n, xs);
  const values = data.flatMap((d) => series.map((s) => d[s.key]).filter((v): v is number => typeof v === "number"));
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const ticks = niceTicks(zeroBased ? 0 : lo, hi, 4);
  const y0 = zeroBased ? 0 : Math.min(lo, ticks[0] ?? lo);
  const y1 = Math.max(hi, ticks[ticks.length - 1] ?? hi);
  const y = linearScale(y0, y1, height - m.b, m.t);
  const labelIdx = Math.max(1, Math.round(n / (narrow ? 3 : 5)));
  const lastRow = data[n - 1];
  const endYs = series.map((s) => y(Number(lastRow?.[s.key] ?? 0)));
  const labelYs = spreadLabels(endYs, 14, m.t + 4, height - m.b);
  const cur = tip ? data[tip.index] : undefined;

  return (
    <div>
      {narrow && series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3" style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </li>
          ))}
        </ul>
      )}
    <div ref={ref} className="relative" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={label} tabIndex={0} onPointerMove={onMove} onPointerLeave={() => setTip(null)} onKeyDown={onKey} onBlur={() => setTip(null)} className="block outline-none focus-visible:outline-2">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">
                {yFormat(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            (i % labelIdx === 0 && n - 1 - i >= Math.ceil(labelIdx / 2)) || i === n - 1 ? (
              <text key={String(d.x)} x={xs[i]} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted)">
                {xLabel(String(d.x))}
              </text>
            ) : null,
          )}
          {series.map((s) => (
            <path key={s.key} d={linePath(xs, data.map((d) => (typeof d[s.key] === "number" ? y(d[s.key] as number) : null)))} fill="none" stroke={s.color} strokeWidth={s.width ?? 1.5} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {!narrow && series.map((s, i) => (
            <text key={s.key} x={w - m.r + 8} y={(labelYs[i] ?? 0) + 4} fontSize="12" fill={i === 0 ? s.color : "var(--muted)"} fontWeight={500}>
              {s.name}
            </text>
          ))}
          {tip && cur && (
            <g>
              <line x1={tip.x} x2={tip.x} y1={m.t} y2={height - m.b} stroke="var(--grey-2)" />
              {series.map((s) =>
                typeof cur[s.key] === "number" ? <circle key={s.key} cx={tip.x} cy={y(cur[s.key] as number)} r="3.5" fill="var(--panel)" stroke={s.color} strokeWidth="1.5" /> : null,
              )}
            </g>
          )}
        </svg>
      )}
      {tip && cur && (
        <Tooltip x={tip.x} width={w} title={xTitle(String(cur.x))} rows={series.filter((s) => typeof cur[s.key] === "number").map((s) => ({ name: s.name, value: tipFormat(cur[s.key] as number), color: s.color }))} />
      )}
    </div>
    </div>
  );
}

export function BarsChart({ label, data, height = 90, color = "var(--accent-2)", yFormat, tipFormat, xLabel, xTitle, name }: {
  label: string;
  data: { x: string; v: number }[];
  height?: number;
  color?: string;
  yFormat: (v: number) => string;
  tipFormat: (v: number) => string;
  xLabel: (x: string) => string;
  xTitle: (x: string) => string;
  name: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const w = Math.max(width, 0);
  const narrow = w > 0 && w < 520;
  const m = { t: 8, r: narrow ? 12 : 96, b: 20, l: narrow ? 60 : 66 };
  const n = data.length;
  const step = n ? Math.max(w - m.l - m.r, 1) / n : 1;
  const xs = data.map((_, i) => m.l + step * (i + 0.5));
  const { tip, setTip, onMove, onKey } = useCursor(n, xs);
  const lo = Math.min(0, ...data.map((d) => d.v));
  const hi = Math.max(0, ...data.map((d) => d.v));
  const ticks = niceTicks(lo, hi, 2);
  const y = linearScale(Math.min(lo, ticks[0] ?? lo), Math.max(hi, ticks[ticks.length - 1] ?? hi), height - m.b, m.t);
  const cur = tip ? data[tip.index] : undefined;
  const barW = Math.max(2, Math.min(18, step * 0.62));

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={label} tabIndex={0} onPointerMove={onMove} onPointerLeave={() => setTip(null)} onKeyDown={onKey} onBlur={() => setTip(null)} className="block outline-none focus-visible:outline-2">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">
                {yFormat(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const top = Math.min(y(d.v), y(0));
            return <rect key={d.x} x={(xs[i] ?? 0) - barW / 2} y={top} width={barW} height={Math.max(Math.abs(y(d.v) - y(0)), 1)} rx="2" fill={tip?.index === i ? "var(--accent)" : d.v < 0 ? "var(--grey-1)" : color} />;
          })}
          {!narrow && (
            <text x={w - m.r + 8} y={m.t + 8} fontSize="12" fill="var(--muted)" fontWeight={500}>
              {name}
            </text>
          )}
        </svg>
      )}
      {tip && cur && <Tooltip x={tip.x} width={w} title={xTitle(cur.x)} rows={[{ name, value: tipFormat(cur.v), color }]} />}
      <span className="sr-only">{xLabel(data[0]?.x ?? "")}</span>
    </div>
  );
}

export function StackedArea({ label, data, keys, colors, height = 260, tipFormat, xLabel, xTitle }: {
  label: string;
  data: Record<string, string | number>[];
  keys: string[];
  colors: string[];
  height?: number;
  tipFormat: (v: number) => string;
  xLabel: (x: string) => string;
  xTitle: (x: string) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const w = Math.max(width, 0);
  const narrow = w > 0 && w < 520;
  const m = { t: 8, r: narrow ? 12 : 110, b: 24, l: narrow ? 44 : 66 };
  const n = data.length;
  const xs = data.map((_, i) => m.l + (n <= 1 ? 0 : (i / (n - 1)) * Math.max(w - m.l - m.r, 1)));
  const { tip, setTip, onMove, onKey } = useCursor(n, xs);
  const y = linearScale(0, 100, height - m.b, m.t);
  const labelIdx = Math.max(1, Math.round(n / (narrow ? 3 : 5)));
  const cum = data.map((d) => {
    let acc = 0;
    return keys.map((k) => {
      const lo = acc;
      acc += Number(d[k] ?? 0);
      return [lo, acc] as const;
    });
  });
  const area = (ki: number) => {
    const top = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y(cum[i]?.[ki]?.[1] ?? 0).toFixed(1)}`).join("");
    const bottom = [...xs].reverse().map((x, j) => `L${x.toFixed(1)},${y(cum[n - 1 - j]?.[ki]?.[0] ?? 0).toFixed(1)}`).join("");
    return `${top}${bottom}Z`;
  };
  const last = cum[n - 1];
  const labelYs = spreadLabels(keys.map((_, ki) => y(((last?.[ki]?.[0] ?? 0) + (last?.[ki]?.[1] ?? 0)) / 2)), 14, m.t + 4, height - m.b);
  const cur = tip ? data[tip.index] : undefined;

  return (
    <div>
      {narrow && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {keys.map((k, ki) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: colors[ki] }} aria-hidden="true" />
              {k}
            </li>
          ))}
        </ul>
      )}
    <div ref={ref} className="relative" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={label} tabIndex={0} onPointerMove={onMove} onPointerLeave={() => setTip(null)} onKeyDown={onKey} onBlur={() => setTip(null)} className="block outline-none focus-visible:outline-2">
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">
                {t}%
              </text>
            </g>
          ))}
          {keys.map((k, ki) => (
            <path key={k} d={area(ki)} fill={colors[ki]} stroke="var(--panel)" strokeWidth="1" />
          ))}
          {data.map((d, i) =>
            (i % labelIdx === 0 && n - 1 - i >= Math.ceil(labelIdx / 2)) || i === n - 1 ? (
              <text key={String(d.x)} x={xs[i]} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted)">
                {xLabel(String(d.x))}
              </text>
            ) : null,
          )}
          {!narrow && keys.map((k, ki) => (
            <text key={k} x={w - m.r + 8} y={(labelYs[ki] ?? 0) + 4} fontSize="12" fill="var(--muted)" fontWeight={500}>
              {k}
            </text>
          ))}
          {tip && <line x1={tip.x} x2={tip.x} y1={m.t} y2={height - m.b} stroke="var(--ink)" strokeOpacity="0.5" />}
        </svg>
      )}
      {tip && cur && <Tooltip x={tip.x} width={w} title={xTitle(String(cur.x))} rows={keys.map((k, ki) => ({ name: k, value: tipFormat(Number(cur[k] ?? 0)), color: colors[ki] ?? "var(--grey-2)" }))} />}
    </div>
    </div>
  );
}

export function HBars({ rows, format, max }: { rows: { label: string; value: number | null; color?: string; note?: string }[]; format: (v: number) => string; max?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.value ?? 0), 1e-9);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-muted">{r.label}</span>
          <span className="h-2 rounded-full" style={{ background: "var(--grey-3)", opacity: 1 }} aria-hidden="true">
            <span className="block h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, ((r.value ?? 0) / top) * 100))}%`, background: r.color ?? "var(--accent)" }} />
          </span>
          <span className="num min-w-[4.5rem] text-right font-medium text-ink">
            {r.value === null ? "n/a" : format(r.value)}
            {r.note && <span className="ml-1 font-normal text-muted">{r.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Donut({ slices, centerValue, centerLabel, label, size = 168 }: {
  slices: { name: string; value: number; color: string }[];
  centerValue: string;
  centerLabel: string;
  label: string;
  size?: number;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="block shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grey-3)" strokeWidth="12" opacity="0.5" />
      {slices.map((s) => {
        const len = (s.value / total) * c;
        const el = (
          <circle key={s.name} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth="12" strokeDasharray={`${Math.max(len - 2, 0)} ${c}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        );
        offset += len;
        return el;
      })}
      <text x="50%" y="49%" textAnchor="middle" className="num" fontSize="26" fontWeight={300} fill="var(--ink)">
        {centerValue}
      </text>
      <text x="50%" y="49%" dy="20" textAnchor="middle" fontSize="12" fill="var(--muted)">
        {centerLabel}
      </text>
    </svg>
  );
}

export function Sparkline({ values, color = "var(--accent)", width = 88, height = 26 }: { values: (number | null)[]; color?: string; width?: number; height?: number }) {
  const v = values.filter((x): x is number => x !== null);
  if (v.length < 2) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const xs = v.map((_, i) => (i / (v.length - 1)) * width);
  const ys = v.map((x) => height - 3 - ((x - min) / span) * (height - 6));
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Trend over the last ${v.length} months`} className="shrink-0">
      <path d={linePath(xs, ys)} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
