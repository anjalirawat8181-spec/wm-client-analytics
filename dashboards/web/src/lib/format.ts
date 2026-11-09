export const LAKH = 100_000;
export const CRORE = 10_000_000;

export function groupIndian(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toString();
  let out: string;
  if (s.length <= 3) out = s;
  else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    out = `${rest},${last3}`;
  }
  return neg ? `-${out}` : out;
}

function groupedFixed(v: number, digits: number): string {
  const [int = "0", frac] = v.toFixed(digits).split(".");
  const g = groupIndian(Number(int));
  return frac ? `${g}.${frac}` : g;
}

export function formatRupees(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= CRORE) return `${sign}Rs ${groupedFixed(a / CRORE, digits)} crore`;
  if (a >= LAKH) return `${sign}Rs ${groupedFixed(a / LAKH, digits)} lakh`;
  return `${sign}Rs ${groupIndian(a)}`;
}

export function formatRupeesShort(v: number): string {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= CRORE) return `${sign}${groupedFixed(a / CRORE, a >= 100 * CRORE ? 0 : 1)} Cr`;
  if (a >= LAKH) return `${sign}${groupedFixed(a / LAKH, 1)} L`;
  return `${sign}${groupIndian(a)}`;
}

export function formatInt(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? "n/a" : groupIndian(v);
}

export function formatPct(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || Number.isNaN(v) ? "n/a" : `${(v * 100).toFixed(digits)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatMonth(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1] ?? "?"} ${y}`;
}
export function formatMonthShort(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1] ?? "?"} ${String(y).slice(2)}`;
}
