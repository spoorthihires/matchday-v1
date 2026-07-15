import type { SlotItem } from '../../types/slots.js';
import { DOW, slotDayKey, to12, ymd } from './calendarUtils.js';

// Ported from matchday-admin-app_23.html lines 3597-3607 (renderCalWeek): `.cal-week` of 7
// `.cal-wcol`s (Sun-Sat around refDate) — each a `.wh` header (`{DOW}<span>{date}</span>`,
// `today` modifier; click -> onDayClick) over a `.wb` body of `.wslot` entries (`.wt` time +
// `.we` employer; done/cancel modifiers; click -> onSlotClick), or a centered faint "No slots"
// note when empty.
// NOTE on theme.css: `.cal-wcol .wh` and `.wslot .wt`/`.we` are descendant-scoped under their own
// parents (the wizard's `.wh` is separately scoped as `.wstep .wh`; `.wt` also appears as
// `.wiz-top .wt` — both non-colliding). `.cal-week`/`.cal-wcol`/`.wslot` are bare but uniquely
// named — verified no other widget declares them. Collision-free, unlike the month view's bare
// `.cal-cell` fix in Task 4.
const stChipCls = (status: SlotItem['status']): string =>
  status === 'Completed' ? ' done' : status === 'Cancelled' ? ' cancel' : '';

export interface WeekViewProps {
  refDate: Date;
  slots: SlotItem[];
  onSlotClick: (slot: SlotItem) => void;
  onDayClick: (dateKey: string) => void;
}

export function WeekView({ refDate, slots, onSlotClick, onDayClick }: WeekViewProps) {
  const weekStart = new Date(refDate);
  weekStart.setDate(refDate.getDate() - refDate.getDay());
  const todayKey = ymd(new Date());

  const cols = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateKey = ymd(d);
    const isToday = dateKey === todayKey;
    const list = slots
      .filter((s) => slotDayKey(s.date) === dateKey)
      .sort((a, b) => a.start.localeCompare(b.start));

    cols.push(
      <div key={dateKey} className="cal-wcol">
        <div className={`wh${isToday ? ' today' : ''}`} onClick={() => onDayClick(dateKey)}>
          {DOW[d.getDay()]}
          <span>{d.getDate()}</span>
        </div>
        <div className="wb">
          {list.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--faint)', textAlign: 'center', padding: '10px 0' }}>
              No slots
            </div>
          ) : (
            list.map((s) => (
              <div key={s.id} className={`wslot${stChipCls(s.status)}`} onClick={() => onSlotClick(s)}>
                <div className="wt">{to12(s.start)}</div>
                <div className="we">{s.employerName}</div>
              </div>
            ))
          )}
        </div>
      </div>,
    );
  }

  return <div className="cal-week">{cols}</div>;
}
