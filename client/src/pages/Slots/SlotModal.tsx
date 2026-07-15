import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client.js';
import type { SlotInput, SlotItem, SlotStatus } from '../../types/slots.js';
import { useDrives } from '../Drives/hooks/useDrives.js';
import { useEmployers } from '../Employers/hooks/useEmployers.js';
import { useSlotMutations } from './hooks/useSlotMutations.js';

// Ported from matchday-admin-app_23.html lines 1986-2004 (#slotModal .modal-scrim/.modal) and the
// openSlotCreate()/openSlot()/slmSave/slmDelete handlers around lines 3644-3674.
//
// `held` isn't exposed here — there's no UI for it in the prototype either — but the server's
// createSlotSchema/updateSlotSchema still enforce `booked + held <= capacity` on the *merged* doc
// (slots.service.ts's updateSlot re-checks this after Object.assign). So editing a slot whose
// existing `held` reservation pushes that merged total over capacity can 400 even though this
// form's own client-side check (`booked <= capacity`) passed — that server rejection surfaces
// inline via the ApiError catch in handleSave, same as any other server-side validation failure.
const STATUS_OPTIONS: SlotStatus[] = ['Scheduled', 'Completed', 'Cancelled'];

export interface SlotModalProps {
  mode: 'create' | 'edit';
  date?: string;
  slot?: SlotItem;
  onClose: () => void;
}

interface FormState {
  date: string; start: string; end: string; capacity: string; booked: string;
  status: SlotStatus; employerId: string; driveId: string; link: string;
  attended: string; noShow: string;
}

function blankForm(date?: string, slot?: SlotItem): FormState {
  return {
    date: slot ? slot.date.slice(0, 10) : (date ?? ''),
    start: slot?.start ?? '10:00',
    end: slot?.end ?? '12:00',
    capacity: String(slot?.capacity ?? 10),
    booked: String(slot?.booked ?? 0),
    status: slot?.status ?? 'Scheduled',
    employerId: slot?.employerId ?? '',
    driveId: slot?.driveId ?? '',
    link: slot?.link ?? '',
    attended: String(slot?.attended ?? 0),
    noShow: String(slot?.noShow ?? 0),
  };
}

type RequiredField = 'date' | 'start' | 'end' | 'driveId';

export function SlotModal({ mode, date, slot, onClose }: SlotModalProps) {
  const { create, update, remove } = useSlotMutations();
  const [form, setForm] = useState<FormState>(() => blankForm(date, slot));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RequiredField, boolean>>>({});
  const [error, setError] = useState<string | null>(null);

  const { data: employersData } = useEmployers({ limit: 100 });
  const employerOptions = employersData?.items ?? [];
  const { data: drivesData } = useDrives({ limit: 100 });
  const driveOptions = (drivesData?.items ?? []).filter((d) => d.status !== 'Archived');

  // Prototype default (openSlotCreate): a new slot starts pointed at the first available drive
  // (`$('#slmDrive').value = drives[0]?.name || ''`) — set once the list resolves, and only in
  // create mode (edit mode already has slot.driveId from blankForm).
  useEffect(() => {
    if (mode === 'create' && driveOptions.length > 0) {
      setForm((f) => (f.driveId ? f : { ...f, driveId: driveOptions[0].id }));
    }
  }, [mode, driveOptions.length]);

  const pending = create.isPending || update.isPending || remove.isPending;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function generateLink() {
    set('link', `https://meet.hiringhood.com/${Math.random().toString(36).slice(2, 10)}`);
  }

  // Mirrors the server's slotFields/createSlotSchema (slots.schemas.ts): date/start/end/driveId
  // required, end > start, booked <= capacity, attended <= booked. See the module note above for
  // why `held` isn't part of this check.
  function validate(): SlotInput | null {
    const errors: Partial<Record<RequiredField, boolean>> = {
      date: !form.date,
      start: !form.start,
      end: !form.end,
      driveId: !form.driveId,
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      setError('Date, start, end and drive are all required.');
      return null;
    }
    if (form.end <= form.start) {
      setError('End time must be after start time.');
      return null;
    }
    const capacity = Number(form.capacity);
    const booked = Number(form.booked);
    const attended = Number(form.attended);
    const noShow = Number(form.noShow);
    if (booked > capacity) {
      setError('Booked cannot exceed capacity.');
      return null;
    }
    if (attended > booked) {
      setError('Attended cannot exceed booked.');
      return null;
    }
    setError(null);
    return {
      date: form.date, start: form.start, end: form.end, capacity, booked,
      status: form.status, employerId: form.employerId || null, driveId: form.driveId,
      link: form.link.trim(), attended, noShow,
    };
  }

  async function handleSave() {
    const body = validate();
    if (!body) return;
    try {
      if (mode === 'edit' && slot) {
        await update.mutateAsync({ id: slot.id, body });
      } else {
        await create.mutateAsync(body);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  async function handleDelete() {
    if (!slot) return;
    if (!confirm('Delete this slot?')) return;
    try {
      await remove.mutateAsync(slot.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="slmTitle">
        <div className="modal-h">
          <div>
            <h3 id="slmTitle">{mode === 'edit' ? 'Edit Slot' : 'Create Slot'}</h3>
            <p>Interview slot with capacity, allocation and meeting link.</p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          {error && (
            <div className="fld full" style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</div>
          )}
          <div className="fld">
            <label htmlFor="slmDate">Date</label>
            <input
              id="slmDate"
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              style={fieldErrors.date ? { borderColor: 'var(--danger)' } : undefined}
            />
          </div>
          <div className="fld">
            <label htmlFor="slmStart">Start</label>
            <input
              id="slmStart"
              type="time"
              value={form.start}
              onChange={(e) => set('start', e.target.value)}
              style={fieldErrors.start ? { borderColor: 'var(--danger)' } : undefined}
            />
          </div>
          <div className="fld">
            <label htmlFor="slmEnd">End</label>
            <input
              id="slmEnd"
              type="time"
              value={form.end}
              onChange={(e) => set('end', e.target.value)}
              style={fieldErrors.end ? { borderColor: 'var(--danger)' } : undefined}
            />
          </div>
          <div className="fld">
            <label htmlFor="slmCap">Capacity</label>
            <input
              id="slmCap"
              type="number"
              min={1}
              max={50}
              value={form.capacity}
              onChange={(e) => set('capacity', e.target.value)}
            />
          </div>
          <div className="fld">
            <label htmlFor="slmBooked">Booked</label>
            <input
              id="slmBooked"
              type="number"
              min={0}
              value={form.booked}
              onChange={(e) => set('booked', e.target.value)}
            />
          </div>
          <div className="fld">
            <label htmlFor="slmStatus">Status</label>
            <select id="slmStatus" value={form.status} onChange={(e) => set('status', e.target.value as SlotStatus)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="slmEmp">Allocate employer</label>
            <select id="slmEmp" value={form.employerId} onChange={(e) => set('employerId', e.target.value)}>
              <option value="">(Unallocated)</option>
              {employerOptions.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="slmDrive">Drive</label>
            <select
              id="slmDrive"
              value={form.driveId}
              onChange={(e) => set('driveId', e.target.value)}
              style={fieldErrors.driveId ? { borderColor: 'var(--danger)' } : undefined}
            >
              <option value="" disabled>Select a drive…</option>
              {driveOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="fld full">
            <label htmlFor="slmLink">Meeting link</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="slmLink"
                placeholder="https://meet.hiringhood.com/…"
                style={{ flex: 1 }}
                value={form.link}
                onChange={(e) => set('link', e.target.value)}
              />
              <button className="btn btn-ghost" type="button" onClick={generateLink}>
                <i className="ti ti-link" /> Generate
              </button>
            </div>
          </div>
          <div className="fld">
            <label htmlFor="slmAttended">Attended</label>
            <input
              id="slmAttended"
              type="number"
              min={0}
              value={form.attended}
              onChange={(e) => set('attended', e.target.value)}
            />
          </div>
          <div className="fld">
            <label htmlFor="slmNoShow">No-shows</label>
            <input
              id="slmNoShow"
              type="number"
              min={0}
              value={form.noShow}
              onChange={(e) => set('noShow', e.target.value)}
            />
          </div>
        </div>
        <div className="modal-f">
          {mode === 'edit' && (
            <button
              className="btn btn-danger btn-lg"
              style={{ marginRight: 'auto' }}
              disabled={pending}
              onClick={handleDelete}
            >
              <i className="ti ti-trash" /> Delete
            </button>
          )}
          {mode === 'create' && <div className="grow" />}
          <button className="btn btn-ghost btn-lg" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" disabled={pending} onClick={handleSave}>
            <i className="ti ti-device-floppy" /> {pending ? 'Saving…' : 'Save slot'}
          </button>
        </div>
      </div>
    </div>
  );
}
