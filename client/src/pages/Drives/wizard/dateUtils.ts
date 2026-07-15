// Date-chip helpers for Step 2 (Schedule) and the Step 6 review summary. Ported from
// matchday-admin-app_23.html's eventDates()/fmtLabel()/fmtMonth() (lines ~2630-2638), adapted
// to store ISO date strings (compatible with the server's `eventDates: Date[]` field and the
// zod `z.coerce.date()` validator) instead of the prototype's display-label strings.

export function upcomingDates(day: 'Wednesday' | 'Saturday', count = 6, from: Date = new Date()): Date[] {
  const targetDow = day === 'Wednesday' ? 3 : 6; // Sun=0 ... Wed=3, Sat=6
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + 1); // start from tomorrow, matching the prototype
  while (d.getDay() !== targetDow) d.setDate(d.getDate() + 1);
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

// Re-express the calendar date as UTC midnight so the ISO string's date portion is exactly the
// intended calendar day regardless of the browser's local timezone offset.
export function isoDateOnly(d: Date): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
}

export function fmtLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtMonth(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
