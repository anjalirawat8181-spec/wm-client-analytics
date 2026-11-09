export type Scale = (v: number) => number;

export function linearScale(d0: number, d1: number, r0: number, r1: number): Scale {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

export function nearestIndex(x: number, positions: number[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const d = Math.abs((positions[i] ?? 0) - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export function spreadLabels(ys: number[], minGap: number, lo: number, hi: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const placed = order.map((o) => o.y);
  for (let k = 1; k < placed.length; k++) {
    const prev = placed[k - 1] ?? lo;
    if ((placed[k] ?? 0) - prev < minGap) placed[k] = prev + minGap;
  }
  const overflow = (placed[placed.length - 1] ?? 0) - hi;
  if (overflow > 0) for (let k = 0; k < placed.length; k++) placed[k] = (placed[k] ?? 0) - overflow;
  if ((placed[0] ?? lo) < lo) placed[0] = lo;
  const out = new Array<number>(ys.length).fill(0);
  order.forEach((o, k) => {
    out[o.i] = placed[k] ?? o.y;
  });
  return out;
}

export function linePath(xs: number[], ys: (number | null)[]): string {
  let d = "";
  let pen = false;
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i];
    if (y === null || y === undefined || Number.isNaN(y)) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${(xs[i] ?? 0).toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  }
  return d;
}
