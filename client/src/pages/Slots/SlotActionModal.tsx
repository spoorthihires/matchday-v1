import { useState } from 'react';
import { ApiError } from '../../api/client.js';
import type { SlotInput, SlotItem } from '../../types/slots.js';
import { to12 } from './calendarUtils.js';
import { useSlotMutations } from './hooks/useSlotMutations.js';

// Ported from matchday-admin-app_23.html's generic openIA(...) quick-action modal, wired per-kind
// in slotAction() (lines 3644-3674 covers openSlot/openSlotCreate/slotAction together — the
// 'link'/'resch'/'noshow' branches are the ones this component renders; 'edit' opens SlotModal
// instead, and 'join' just calls window.open(s.link) directly from DayView, no modal).
export type SlotActionModalKind = 'link' | 'resch' | 'noshow';

export interface SlotActionModalProps {
  kind: SlotActionModalKind;
  slot: SlotItem;
  onClose: () => void;
}

const META: Record<SlotActionModalKind, { title: string; confirmLabel: string; confirmIcon: string }> = {
  link: { title: 'Meeting Link', confirmLabel: 'Save link', confirmIcon: 'ti-check' },
  resch: { title: 'Reschedule Slot', confirmLabel: 'Reschedule', confirmIcon: 'ti-check' },
  noshow: { title: 'Track No-Shows', confirmLabel: 'Save', confirmIcon: 'ti-check' },
};

function subtitle(kind: SlotActionModalKind, slot: SlotItem): string {
  if (kind === 'resch') return `${slot.employerName} · currently ${slot.date.slice(0, 10)} ${to12(slot.start)}`;
  if (kind === 'noshow') return `${slot.employerName} · ${slot.booked} booked`;
  return `${slot.employerName} · ${to12(slot.start)}`;
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

export function SlotActionModal({ kind, slot, onClose }: SlotActionModalProps) {
  const { update } = useSlotMutations();
  const [link, setLink] = useState(slot.link);
  const [date, setDate] = useState(slot.date.slice(0, 10));
  const [start, setStart] = useState(slot.start);
  const [end, setEnd] = useState(slot.end);
  // Default to the recorded `attended` once the slot has actually been marked Completed (a
  // legitimate `attended: 0` there means a full no-show and must round-trip as 0, not `booked`);
  // otherwise there's nothing recorded yet, so default to full attendance as the admin's starting
  // point to adjust down. (The prototype's unconditional `s.attended||s.booked` — matchday-admin-
  // app_23.html:3673 — has this exact bug: it can't distinguish "not yet recorded" from "recorded
  // as 0", and would silently re-inflate a genuine 0 back to `booked` on re-edit.)
  const [attended, setAttended] = useState(String(slot.status === 'Completed' ? slot.attended : slot.booked));
  const [error, setError] = useState<string | null>(null);

  function generateLink() {
    setLink(`https://meet.hiringhood.com/${Math.random().toString(36).slice(2, 10)}`);
  }

  function handleConfirm() {
    let body: Partial<SlotInput>;
    if (kind === 'link') {
      body = { link: link.trim() };
    } else if (kind === 'resch') {
      if (!date || !start || !end) { setError('Date, start and end are all required.'); return; }
      if (end <= start) { setError('End time must be after start time.'); return; }
      body = { date, start, end };
    } else {
      const att = Math.min(slot.booked, Math.max(0, Number(attended) || 0));
      body = { attended: att, noShow: slot.booked - att, status: 'Completed' };
    }
    setError(null);
    update.mutate({ id: slot.id, body }, {
      onSuccess: onClose,
      onError: (err) => setError(mutationErrorMessage(err)),
    });
  }

  const meta = META[kind];

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="slotActionTitle">
        <div className="modal-h">
          <div>
            <h3 id="slotActionTitle">{meta.title}</h3>
            <p>{subtitle(kind, slot)}</p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          {error && (
            <div className="fld full" style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</div>
          )}
          {kind === 'link' && (
            <div className="fld full">
              <label htmlFor="slaLink">Meeting link</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="slaLink"
                  placeholder="https://…"
                  style={{ flex: 1 }}
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
                <button className="btn btn-ghost" type="button" onClick={generateLink}>
                  <i className="ti ti-link" /> Generate
                </button>
              </div>
            </div>
          )}
          {kind === 'resch' && (
            <>
              <div className="fld">
                <label htmlFor="slaDate">New date</label>
                <input id="slaDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="fld">
                <label htmlFor="slaStart">Start</label>
                <input id="slaStart" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="fld">
                <label htmlFor="slaEnd">End</label>
                <input id="slaEnd" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </>
          )}
          {kind === 'noshow' && (
            <div className="fld">
              <label htmlFor="slaAttended">Attended</label>
              <input
                id="slaAttended"
                type="number"
                min={0}
                max={slot.booked}
                value={attended}
                onChange={(e) => setAttended(e.target.value)}
              />
              <p className="fnote">No-shows are calculated as booked − attended.</p>
            </div>
          )}
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" disabled={update.isPending} onClick={handleConfirm}>
            <i className={`ti ${meta.confirmIcon}`} /> {update.isPending ? 'Saving…' : meta.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
