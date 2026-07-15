import type { SlotItem } from '../../types/slots.js';
import { DOW, monthGridStart, slotDayKey, to12, ymd } from './calendarUtils.js';

// Ported from matchday-admin-app_23.html lines 3584-3596 (renderCalMonth): `.cal-month` wrapping
// `.cal-dow` (7 headers) + a `.cal-grid` of 42 `.cal-cell`s. Verified against theme.css: the
// SLOTS-page rules for `.cal-grid`/`.cal-cell`/`.dnum`/`.cal-chip`/`.cal-more` (lines 867-880) are
// bare, unscoped class selectors — NOT `.cal-month .cal-grid` compound selectors — so this markup
// (a plain `.cal-cell` with `dim`/`event`/`today` modifier classes) is exactly the structure the
// CSS expects. NOTE: the dashboard's mini-calendar (ScheduleSection.tsx) also uses bare
// `.cal-grid`/`.cal-cell` (theme.css lines 298-305, with `mute`/`wed`/`next` modifiers instead).
// Since CSS classes aren't scoped per-route, this is a genuine pre-existing naming collision
// between the two calendar widgets in theme.css — see task-4-report.md for details. It doesn't
// block this component (the two rule sets' properties mostly don't overlap and only one calendar
// is mounted per route), but it means neither widget can safely add a new bare `.cal-cell` rule
// without checking the other.
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
    const dow = d.getDay();
    const isToday = dateKey === todayKey;
    const list = slots
      .filter((s) => slotDayKey(s.date) === dateKey)
      .sort((a, b) => a.start.localeCompare(b.start));
    const shown = list.slice(0, MAX_CHIPS);
    const extra = list.length - MAX_CHIPS;

    const cls = `cal-cell${!inMonth ? ' dim' : ''}${(dow === 3 || dow === 6) && inMonth ? ' event' : ''}${isToday ? ' today' : ''}`;

    cells.push(
      <div key={dateKey} className={cls} onClick={() => { if (inMonth) onCellClick(dateKey); }}>
        <div className="dnum">{d.getDate()}</div>
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
