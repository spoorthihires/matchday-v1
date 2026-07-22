import type { SlotItem } from '../../types/slots.js';
import { DOW, monthGridStart, slotDayKey, to12, ymd } from './calendarUtils.js';

// Ported from matchday-admin-app_23.html lines 3584-3596 (renderCalMonth): `.cal-month` wrapping
// `.cal-dow` (7 headers) + a `.cal-grid` of 42 `.cal-cell`s, each with `dim`/`today` modifier
// classes, a `.dnum`, up to MAX_CHIPS `.cal-chip`s (done/cancel) and a `.cal-more`. The prototype's
// weekday-based `.event` wash (Wed/Sat, unrelated to whether the day actually has slots) was
// dropped in the Google-Calendar-style redesign — it read as decorative noise, not signal.
// NOTE on theme.css: `.cal-grid`/`.cal-cell` are also used by the dashboard's mini-calendar
// (ScheduleSection.tsx). Both widgets' rules were originally bare selectors, so the cascade merged
// the two (mostly disjoint) rule sets onto whichever calendar was mounted — e.g. the dashboard's
// `display:flex; aspect-ratio:1/1` leaked into these month cells, rendering chips inline in
// near-square cells. The rules are now scoped — this widget's under `.cal-month`, the dashboard's
// under `.cal` — guarded by client/src/test/themeCalendarScoping.test.tsx.
const MAX_CHIPS = 3;

const chipClass = (status: SlotItem['status']): string =>
  status === 'Completed' ? ' done' : status === 'Cancelled' ? ' cancel' : '';

export interface MonthViewProps {
  refDate: Date;
  slots: SlotItem[];
  onChipClick: (slot: SlotItem) => void;
  onMoreClick: (dateKey: string) => void;
  onCellClick: (dateKey: string) => void;
}

export function MonthView({ refDate, slots, onChipClick, onMoreClick, onCellClick }: MonthViewProps) {
  const month = refDate.getMonth();
  const start = monthGridStart(refDate);
  const todayKey = ymd(new Date());

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateKey = ymd(d);
    const inMonth = d.getMonth() === month;
    const isToday = dateKey === todayKey;
    const list = slots
      .filter((s) => slotDayKey(s.date) === dateKey)
      .sort((a, b) => a.start.localeCompare(b.start));
    const shown = list.slice(0, MAX_CHIPS);
    const extra = list.length - MAX_CHIPS;

    const cls = `cal-cell${!inMonth ? ' dim' : ''}${isToday ? ' today' : ''}`;

    cells.push(
      <div key={dateKey} className={cls} onClick={() => { if (inMonth) onCellClick(dateKey); }}>
        <div className="dnum">{d.getDate()}</div>
        <div className="cal-events">
          {shown.map((s) => (
            <span
              key={s.id}
              className={`cal-chip${chipClass(s.status)}`}
              onClick={(e) => { e.stopPropagation(); onChipClick(s); }}
            >
              {to12(s.start)} · {s.employerName.split(' ')[0]}
            </span>
          ))}
          {extra > 0 && (
            <div className="cal-more" onClick={(e) => { e.stopPropagation(); onMoreClick(dateKey); }}>
              +{extra} more
            </div>
          )}
        </div>
      </div>,
    );
  }

  return (
    <div className="cal-month">
      <div className="cal-dow">
        {DOW.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="cal-grid">{cells}</div>
    </div>
  );
}
