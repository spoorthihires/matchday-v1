import { useState } from 'react';
import { ApiError } from '../../../api/client.js';
import type { Registration, RegistrationActionPayload } from '../../../types/employers.js';
import { useDrives } from '../../Drives/hooks/useDrives.js';
import { useRegistrationAction } from './hooks/useRegistrationAction.js';

// Ported from matchday-admin-app_23.html's generic openIA(...) modal, wired per-action in the
// `[data-aa]` click handler (lines 3540-3546): reason textarea for Reject, note textarea for
// Request Changes, a drive select for Move Drive, and a slot select for Change Slot.
export type ActionModalKind = 'reject' | 'request-changes' | 'move-drive' | 'change-slot';

export interface ActionModalProps {
  kind: ActionModalKind;
  registration: Registration;
  onClose: () => void;
}

const WINDOWS = ['10:00–12:00', '14:00–16:00'];

function nextWeekdays(targetDow: number, count: number, from: Date): Date[] {
  const dates: Date[] = [];
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  while (dates.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === targetDow) dates.push(new Date(d));
  }
  return dates;
}

function formatSlotDate(d: Date): string {
  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
  const monthName = d.toLocaleDateString('en-US', { month: 'short' });
  return `${dayName}, ${monthName} ${d.getDate()}`;
}

// APPR_SLOTS from the prototype (line 3487), generated dynamically here: the next 3 Wednesdays +
// 2 Saturdays, each paired with both interview windows — client-side display only, computed at
// render time (no determinism constraint per the task brief).
export function buildSlotOptions(now: Date = new Date()): string[] {
  const dates = [...nextWeekdays(3, 3, now), ...nextWeekdays(6, 2, now)]; // 3=Wed, 6=Sat
  const options: string[] = [];
  for (const d of dates) {
    for (const w of WINDOWS) options.push(`${formatSlotDate(d)} · ${w}`);
  }
  return options;
}

const META: Record<ActionModalKind, { title: string; confirmLabel: string; confirmIcon: string }> = {
  reject: { title: 'Reject Registration', confirmLabel: 'Reject', confirmIcon: 'ti-circle-x' },
  'request-changes': { title: 'Request Changes', confirmLabel: 'Send request', confirmIcon: 'ti-message-dots' },
  'move-drive': { title: 'Move Drive', confirmLabel: 'Move', confirmIcon: 'ti-check' },
  'change-slot': { title: 'Change Slot', confirmLabel: 'Update slot', confirmIcon: 'ti-check' },
};

function mutationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

export function ActionModal({ kind, registration, onClose }: ActionModalProps) {
  const mutation = useRegistrationAction();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [driveId, setDriveId] = useState(registration.driveId ?? '');
  const [slotOptions] = useState(() => buildSlotOptions());
  const [slot, setSlot] = useState(() => (slotOptions.includes(registration.slot) ? registration.slot : slotOptions[0]));

  // Only Move Drive needs the drive list — fetched unconditionally (hooks can't be conditional)
  // but harmless for the other variants since react-query only fires the request when this
  // modal is mounted at all, which only happens for one `kind` at a time.
  const { data: drivesData } = useDrives({ limit: 100 });
  const driveOptions = (drivesData?.items ?? []).filter((d) => d.status !== 'Archived');

  function handleConfirm() {
    let payload: RegistrationActionPayload;
    switch (kind) {
      case 'reject':
        payload = { action: 'reject', reason: reason.trim() || undefined };
        break;
      case 'request-changes':
        payload = { action: 'request-changes', note: note.trim() || undefined };
        break;
      case 'move-drive':
        payload = { action: 'move-drive', driveId };
        break;
      case 'change-slot':
        payload = { action: 'change-slot', slot };
        break;
    }
    mutation.mutate({ id: registration._id, payload }, { onSuccess: onClose });
  }

  const meta = META[kind];

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="apprActionTitle">
        <div className="modal-h">
          <div>
            <h3 id="apprActionTitle">{meta.title}</h3>
            <p>{registration.company} · {registration.role}</p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          {mutation.isError && (
            <div className="fld full" style={{ color: 'var(--danger)', fontSize: 12.5 }}>
              {mutationErrorMessage(mutation.error)}
            </div>
          )}
          {kind === 'reject' && (
            <div className="fld">
              <label htmlFor="apprReason">Reason for rejection</label>
              <textarea
                id="apprReason"
                rows={3}
                placeholder="Share why this registration is being rejected…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
          {kind === 'request-changes' && (
            <div className="fld">
              <label htmlFor="apprNote">What needs to change?</label>
              <textarea
                id="apprNote"
                rows={3}
                placeholder="Describe the changes required…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}
          {kind === 'move-drive' && (
            <div className="fld">
              <label htmlFor="apprDrive">Move to drive</label>
              <select id="apprDrive" value={driveId} onChange={(e) => setDriveId(e.target.value)}>
                {driveOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          {kind === 'change-slot' && (
            <div className="fld">
              <label htmlFor="apprSlot">Interview slot</label>
              <select id="apprSlot" value={slot} onChange={(e) => setSlot(e.target.value)}>
                {slotOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" disabled={mutation.isPending} onClick={handleConfirm}>
            <i className={`ti ${meta.confirmIcon}`} /> {mutation.isPending ? 'Saving…' : meta.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
