/** An error that is safe to show to the user. */
export const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export const today = () => new Date().toISOString().slice(0, 10);
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isMonth = (s) => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
export const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
export const fmt = (minor) => (minor / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const accName = (a) => `${a.provider}${a.label ? ' ' + a.label : ''} (${a.currency})`;

/** "12.50" → 1250 cents. Rejects negatives, text and (unless allowed) zero. */
export function toMinor(v, name = 'Amount', allowZero = false) {
  const n = Number(v);
  if (v === '' || v == null || !Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) {
    throw bad(`${name} must be ${allowZero ? 'zero or more' : 'greater than zero'}`);
  }
  if (n > 1e13) throw bad(`${name} is too large`);
  return Math.round(n * 100);
}

/** Number of months from a to b, both included (YYYY-MM). */
export function monthsBetween(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return Math.max(0, (by - ay) * 12 + (bm - am) + 1);
}

/** Number of days from a to b, both included (YYYY-MM-DD). 0 if b is before a. */
export function daysBetween(a, b) {
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1);
}

/** How many billing periods (days, weeks or months) a rental has run from `start` to `last`. */
export function periodsDue(unit, start, last) {
  if (last < start) return 0;
  if (unit === 'month') return monthsBetween(start.slice(0, 7), last.slice(0, 7));
  const days = daysBetween(start, last);
  return unit === 'week' ? Math.ceil(days / 7) : days;
}
