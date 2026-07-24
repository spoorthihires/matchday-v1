import type { DashboardOverview } from '../../types/dashboard.js';

// Ported from matchday-admin-app_23.html lines ~1264-1303.
const C = 339.3; // slot donut circumference: 2π·54
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ScheduleSection({
  schedule, slot,
}: { schedule: DashboardOverview['schedule']; slot: DashboardOverview['slotUtilization'] }) {
  const offset = (C * (1 - slot.utilizedPct / 100)).toFixed(1);
  return (
    <>
      <div className="section-title">Schedule &amp; capacity <span className="rule" /></div>
      <div className="grid-2">
        <div className="card">
          <div className="card-h">
            <div><h3>Upcoming Events</h3><div className="sub">{schedule.monthLabel} · Wednesdays are MatchDays</div></div>
          </div>
          <div className="cal">
            <div className="cal-grid">
              {DOW.map((d, i) => <div className="dow" key={i}>{d}</div>)}
              {schedule.calendar.map((c, i) => (
                <div
                  key={i}
                  className={`cal-cell${!c.inMonth ? ' mute' : ''}${c.isWed ? ' wed' : ''}${c.isToday ? ' today' : ''}${c.isNextMatchDay ? ' next' : ''}`}
                >
                  {c.inMonth ? c.day : ''}
                </div>
              ))}
            </div>
          </div>
          <div className="events">
            {schedule.events.map((e) => {
              // e.date is a UTC-midnight ISO calendar date — use UTC getters
              // (not toDateString/toLocaleString's local-time-zone rules) so
              // the displayed day never rolls back depending on where this
              // runs.
              const d = new Date(e.date);
              return (
                <div className="event" key={e.date}>
                  <div className="ed">
                    <div className="d mono">{d.getUTCDate()}</div>
                    <div className="m">{MONTH_SHORT[d.getUTCMonth()]}</div>
                  </div>
                  <div className="ei">
                    <b>{e.title}</b>
                    <span>{e.employers} employers · {e.slots} slots · {e.candidates} jobseekers</span>
                  </div>
                  <span className={`estat ${e.status}`}>{e.status === 'prep' ? `Prep ${e.prepPct}%` : 'Open'}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><div><h3>Slot Utilization</h3><div className="sub">Next MatchDay</div></div></div>
          <div className="slot">
            <div className="donut">
              <svg width="130" height="130" viewBox="0 0 130 130">
                <circle cx="65" cy="65" r="54" fill="none" stroke="var(--indigo-050)" strokeWidth="14" />
                <circle
                  cx="65"
                  cy="65"
                  r="54"
                  fill="none"
                  stroke="var(--indigo)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={offset}
                />
              </svg>
              <div className="center"><span className="n mono">{slot.utilizedPct}%</span><span className="k">utilized</span></div>
            </div>
            <div className="slot-legend">
              <div className="lg">
                <span className="lgn"><span className="sw" style={{ background: 'var(--indigo)' }} /> Booked</span>
                <span className="lgv">{slot.booked}</span>
              </div>
              <div className="lg">
                <span className="lgn"><span className="sw" style={{ background: 'var(--violet)' }} /> Held / pending</span>
                <span className="lgv">{slot.held}</span>
              </div>
              <div className="lg">
                <span className="lgn"><span className="sw" style={{ background: 'var(--indigo-100)' }} /> Available</span>
                <span className="lgv">{slot.available}</span>
              </div>
              <div className="lg">
                <span className="lgn"><span className="sw" style={{ background: 'var(--line-strong)' }} /> Total capacity</span>
                <span className="lgv">{slot.total}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
