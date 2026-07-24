import { useState } from 'react';
import { ApiError } from '../../api/client.js';
import type { SlotItem } from '../../types/slots.js';
import { to12 } from './calendarUtils.js';
import { useBookingMutations, useEligibleCandidates, useSlotRoster } from './hooks/useSlotBookings.js';

// Roster/booking modal opened from SlotModal's edit-mode "Roster" button (Task 6). Consumes
// Task 5's hooks (useSlotRoster/useEligibleCandidates/useBookingMutations) and reuses the
// prototype's modal-scrim/.modal/.fld/.btn classes — no new CSS, mirrors SlotModal.tsx's shell.
export interface SlotRosterModalProps {
  slot: SlotItem;
  onClose: () => void;
}

export function SlotRosterModal({ slot, onClose }: SlotRosterModalProps) {
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: roster } = useSlotRoster(slot.id);
  const { data: eligible } = useEligibleCandidates(slot.id, q);
  const { book, confirm, release } = useBookingMutations(slot.id);

  const booked = roster?.booked ?? [];
  const held = roster?.held ?? [];
  const seatsUsed = booked.length + held.length;
  const full = seatsUsed >= slot.capacity;

  function run(p: Promise<unknown>) {
    setError(null);
    p.catch((e) => setError(e instanceof ApiError ? e.message : 'Something went wrong.'));
  }

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rosterTitle">
        <div className="modal-h">
          <div>
            <h3 id="rosterTitle">Slot Roster</h3>
            <p>
              {slot.driveName} · {slot.date.slice(0, 10)} {to12(slot.start)} · {booked.length} booked / {slot.capacity} · {held.length} held
            </p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          {error && <div className="fld full" style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</div>}

          <div className="fld full">
            <label>Booked ({booked.length})</label>
            {booked.length === 0 && <p className="fnote">No jobseekers booked yet.</p>}
            {booked.map((r) => (
              <div key={r.bookingId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ flex: 1 }}>{r.name} · {r.institute} · {r.branch} · {r.stage}</span>
                <button className="btn btn-ghost" disabled={release.isPending} onClick={() => run(release.mutateAsync(r.bookingId))}>Remove</button>
              </div>
            ))}
          </div>

          <div className="fld full">
            <label>Held ({held.length})</label>
            {held.length === 0 && <p className="fnote">No holds.</p>}
            {held.map((r) => (
              <div key={r.bookingId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ flex: 1 }}>{r.name} · {r.institute} · {r.branch} · {r.stage}</span>
                <button className="btn btn-ghost" disabled={confirm.isPending} onClick={() => run(confirm.mutateAsync(r.bookingId))}>Confirm</button>
                <button className="btn btn-ghost" disabled={release.isPending} onClick={() => run(release.mutateAsync(r.bookingId))}>Release</button>
              </div>
            ))}
          </div>

          <div className="fld full">
            <label htmlFor="rosterSearch">Add a jobseeker {full && '(slot full)'}</label>
            <input
              id="rosterSearch"
              placeholder="Search Match-Ready jobseekers…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={full}
            />
            {(eligible?.items ?? []).map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ flex: 1 }}>{c.name} · {c.institute} · {c.branch} · {c.stage}</span>
                <button className="btn btn-ghost" disabled={full || book.isPending} onClick={() => run(book.mutateAsync({ jobseekerId: c.id, status: 'Held' }))}>Hold</button>
                <button className="btn btn-primary" disabled={full || book.isPending} onClick={() => run(book.mutateAsync({ jobseekerId: c.id, status: 'Booked' }))}>Book</button>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
