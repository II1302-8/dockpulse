import { fmtDateTime } from "../lib/date";

export function fmtTs(ts: string | null | undefined): string {
  return fmtDateTime(ts);
}

export function fmtRelative(ts: string | null | undefined): string {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  // future timestamps (e.g. expires_at) should read "in 2d", not "-Xs ago"
  const future = ms < 0;
  const abs = Math.abs(ms);
  const s = Math.round(abs / 1000);
  const wrap = (v: number, unit: string) =>
    future ? `in ${v}${unit}` : `${v}${unit} ago`;
  if (s < 60) return wrap(s, "s");
  const m = Math.round(s / 60);
  if (m < 60) return wrap(m, "m");
  const h = Math.round(m / 60);
  if (h < 24) return wrap(h, "h");
  const d = Math.round(h / 24);
  return wrap(d, "d");
}
