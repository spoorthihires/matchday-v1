// Calendar helpers ported from matchday-admin-app_23.html lines 3556-3560 (pad2/ymd/to12) and
// 3587 (month-grid start: `new Date(y, m, 1 - first.getDay())`). Shared by index.tsx (toolbar
// title + visible-range query) and MonthView.tsx (per-cell day keys).
//
// Day-key decision: the server stores each slot's `date` as a UTC-midnight ISO string (e.g.
// "2026-07-15T00:00:00.000Z"). Rather than converting that instant to a local Date (which can
// roll the calendar day backward for timezones behind UTC), we treat `date.slice(0, 10)` as the
// canonical calendar-day key — date-only semantics, exactly like the prototype's plain
// `YYYY-MM-DD` strings. Grid cells are built from LOCAL Date arithmetic (`ymd`, which reads
// getFullYear/getMonth/getDate) and produce the same `YYYY-MM-DD` shape, so the two keys line up
// as long as the two are compared as opaque strings — never by converting one into a Date and
// re-deriving the other from it.

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// LOCAL y-m-d string (mirrors the prototype's `ymd`).
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Canonical day key for a slot's ISO `date` field — see the module note above.
export function slotDayKey(iso: string): string {
  return iso.slice(0, 10);
}

// 'YYYY-MM-DD' -> local midnight Date (mirrors the prototype's `parseYmd`).
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// '10:00' -> '10:00 AM' (mirrors the prototype's `to12`).
export function to12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${pad2(m)} ${ap}`;
}

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MON = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// First cell of the 42-cell month grid: the Sunday on/before the 1st of the month.
export function monthGridStart(refDate: Date): Date {
  const first = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  return new Date(refDate.getFullYear(), refDate.getMonth(), 1 - first.getDay());
}

export type CalView = 'month' | 'week' | 'day';

// Visible from/to ('YYYY-MM-DD') for the given view + refDate — drives useSlots's query range.
// month: the full 42-cell grid; week: Sun-Sat around refDate; day: refDate only.
export function visibleRange(view: CalView, refDate: Date): { from: string; to: string } {
  if (view === 'month') {
    const start = monthGridStart(refDate);
    const end = new Date(start);
    end.setDate(start.getDate() + 41);
    return { from: ymd(start), to: ymd(end) };
  }
  if (view === 'week') {
    const start = new Date(refDate);
    start.setDate(refDate.getDate() - refDate.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: ymd(start), to: ymd(end) };
  }
  const d = ymd(refDate);
  return { from: d, to: d };
}
