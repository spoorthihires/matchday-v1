import { useState } from 'react';
import type { EmployerCalendarEvent } from '../../types/employer.js';

// MatchDay month-calendar for the dashboard's right column (Task 3, off Task 1's
// `dashboard.calendarEvents` and Task 2's placeholder card). Ported from the prototype
// MatchDay_Employer_V1.html's renderCalendar() (~line 4086), adapted to React state + the
// real `calendarEvents` feed instead of the demo's REGISTRATIONS/RT_SEED `regMap`. No
// click-popup (the prototype's showCalPopup) and no "Available MatchDay" legend item --
// there's no availability data behind this feed, only the employer's own registered dates.

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Date-matching: `calendarEvents[].date` is an ISO string the server builds via
// `new Date(driveEventDate).toISOString()`, and drive event dates are stored as date-only
// values (midnight UTC) -- so the "calendar day" an event represents is that instant's UTC
// y/m/d, not whatever local day it falls on in the viewer's timezone (which can shift by one
// day either side of a UTC midnight boundary). To avoid an off-by-one, the grid itself is
// built and compared entirely in UTC too (Date.UTC + getUTC* everywhere below, including the
// month label and the "today" check) so both sides of every comparison share one clock.
function ymdUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

interface Cell {
  key: string;
  day: number | null;
  muted: boolean;
  isToday: boolean;
  isMatchday: boolean;
  isWed: boolean;
}

function buildCells(year: number, month: number, matchdaySet: Set<string>, today: Date): Cell[] {
  const first = new Date(Date.UTC(year, month, 1));
  const startPad = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayKey = ymdUTC(today);

  const cells: Cell[] = [];
  for (let i = 0; i < startPad; i++) {
    cells.push({ key: `lead-${i}`, day: null, muted: true, isToday: false, isMatchday: false, isWed: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dt = new Date(Date.UTC(year, month, day));
    cells.push({
      key: `d-${day}`,
      day,
      muted: false,
      isToday: ymdUTC(dt) === todayKey,
      isMatchday: matchdaySet.has(ymdUTC(dt)),
      isWed: dt.getUTCDay() === 3,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `pad-${cells.length}`, day: null, muted: true, isToday: false, isMatchday: false, isWed: false });
  }
  return cells;
}

export function MatchDayCalendar({ calendarEvents }: { calendarEvents: EmployerCalendarEvent[] }) {
  const now = new Date();
  const [view, setView] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() });

  const matchdaySet = new Set(calendarEvents.map((e) => ymdUTC(new Date(e.date))));
  const cells = buildCells(view.year, view.month, matchdaySet, now);
  const monthLabel = new Date(Date.UTC(view.year, view.month, 1))
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(view.year, view.month + delta, 1));
    setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  }

  return (
    <>
      <div className="cal-head">
        <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <span className="m">{monthLabel}</span>
        <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>
          <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
      <div className="cal-grid">
        {DOW.map((d, i) => <div className="cal-dow" key={`dow-${i}`}>{d}</div>)}
        {cells.map((c) => {
          if (c.muted) return <div className="cal-day muted" key={c.key} />;
          const classes = ['cal-day'];
          if (c.isMatchday) classes.push('matchday');
          else if (c.isWed) classes.push('wed');
          if (c.isToday) classes.push('today');
          return <div className={classes.join(' ')} key={c.key}>{c.day}</div>;
        })}
      </div>
      <div className="cal-legend">
        <span><i style={{ background: 'var(--indigo)' }} /> Registered</span>
      </div>
    </>
  );
}
