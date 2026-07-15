import type { SlotItem } from '../../types/slots.js';
import { to12 } from './calendarUtils.js';

// Ported from matchday-admin-app_23.html lines 3608-3628 (renderCalDay): `.cal-dayv` of `.dslot`
// cards for the slots on the visible day (index.tsx's `slotsOn` helper already filters + time-
// sorts them before they reach this component) — `.dtime` (12h start + "to {end}"), `.dmain`
// (employer name, status badge, `.dl` detail row, `.cap-bar` capacity meter), `.dacts` quick-
// action buttons. `.dm-empty` state when the day has no slots.
// NOTE on theme.css: `.cal-dayv`, `.dslot`, and its descendants `.dtime`/`.dmain`/`.dl`/`.dacts`
// are all scoped under `.dslot` (or bare-but-uniquely-named) — verified collision-free.
const stChipCls = (status: SlotItem['status']): string =>
  status === 'Completed' ? ' done' : status === 'Cancelled' ? ' cancel' : '';

const statusBadgeClass = (status: SlotItem['status']): string =>
  status === 'Completed' ? 'st-active' : status === 'Cancelled' ? 'st-archived' : 'st-published';

export type SlotActionKind = 'link' | 'resch' | 'noshow' | 'edit';

export interface DayViewProps {
  slots: SlotItem[];
  onAction: (kind: SlotActionKind, slot: SlotItem) => void;
}

export function DayView({ slots, onAction }: DayViewProps) {
  if (slots.length === 0) {
    return (
      <div className="dm-empty" style={{ padding: 50 }}>
        <i className="ti ti-calendar-off" />
        No slots on this day. Use “Create Slot” to add one.
      </div>
    );
  }

  return (
    <div className="cal-dayv">
      {slots.map((s) => {
        const pct = s.capacity > 0 ? Math.min(100, Math.round((s.booked / s.capacity) * 100)) : 0;
        return (
          <div key={s.id} className={`dslot${stChipCls(s.status)}`}>
            <div className="dtime">
              {to12(s.start)}
              <small>to {to12(s.end)}</small>
            </div>
            <div className="dmain">
              <b style={{ fontSize: 14 }}>{s.employerName}</b>{' '}
              <span className={`badge-st ${statusBadgeClass(s.status)}`}>
                <i className="ti ti-circle-filled" /> {s.status}
              </span>
              <div className="dl">
                <span>Drive: <b>{s.driveName}</b></span>
                <span>Capacity: <b>{s.booked}/{s.capacity}</b></span>
                {s.status === 'Completed' && (
                  <>
                    <span>Attended: <b>{s.attended}</b></span>
                    <span>No-shows: <b style={{ color: 'var(--danger)' }}>{s.noShow}</b></span>
                  </>
                )}
                {s.link && <span>Link: <b style={{ color: 'var(--indigo)' }}>available</b></span>}
              </div>
              <div className="cap-bar"><i style={{ width: `${pct}%` }} /></div>
            </div>
            <div className="dacts">
              {s.link && s.status !== 'Cancelled' && (
                <button type="button" onClick={() => window.open(s.link, '_blank', 'noopener,noreferrer')}>
                  <i className="ti ti-video" /> Join
                </button>
              )}
              <button type="button" onClick={() => onAction('link', s)}>
                <i className="ti ti-link" /> Link
              </button>
              <button type="button" onClick={() => onAction('resch', s)}>
                <i className="ti ti-calendar-clock" /> Reschedule
              </button>
              <button type="button" onClick={() => onAction('noshow', s)}>
                <i className="ti ti-user-x" /> No-shows
              </button>
              <button type="button" onClick={() => onAction('edit', s)}>
                <i className="ti ti-edit" /> Edit
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
