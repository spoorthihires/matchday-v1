import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerDrive } from './hooks/useEmployerDrives.js';
import { useEmployerSlots, useSlotMutations } from './hooks/useEmployerSlots.js';
import type { EmployerSlot } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }

const AUTO_LINK_PREFIX = 'https://meet.hiringhood.test/';

interface FormState { editingId: string | null; date: string; start: string; end: string; capacity: string; linkMode: 'auto' | 'own'; link: string; }
const EMPTY: FormState = { editingId: null, date: '', start: '', end: '', capacity: '8', linkMode: 'auto', link: '' };

export function EmployerSlots() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const drive = useEmployerDrive(driveId);
  const slots = useEmployerSlots(driveId);
  const { create, update, remove } = useSlotMutations(driveId);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState<string>('');

  const eventDates = drive.data?.eventDates ?? [];
  const items = slots.data?.items ?? [];
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const nextErrors = useMemo(() => () => {
    const e: Record<string, boolean> = {};
    if (!form.date) e.date = true;
    if (!form.start) e.start = true;
    if (!form.end) e.end = true;
    if (form.start && form.end && form.end <= form.start) e.end = true;
    const cap = Number(form.capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 50) e.capacity = true;
    if (form.linkMode === 'own') {
      const v = form.link.trim();
      if (!v) e.link = true;
      else { try { new URL(v); } catch { e.link = true; } }
    }
    return e;
  }, [form]);

  function submit() {
    setSubmitError('');
    const e = nextErrors();
    setErrors(e);
    if (Object.keys(e).length) return;
    const payload = { date: form.date, start: form.start, end: form.end, capacity: Number(form.capacity), linkMode: form.linkMode, link: form.linkMode === 'own' ? form.link.trim() : undefined };
    const onDone = () => { setForm(EMPTY); setErrors({}); };
    const onErr = (err: unknown) => setSubmitError(errMsg(err));
    if (form.editingId) update.mutate({ slotId: form.editingId, patch: payload }, { onSuccess: onDone, onError: onErr });
    else create.mutate(payload, { onSuccess: onDone, onError: onErr });
  }

  function startEdit(s: EmployerSlot) {
    const isAuto = !s.link || s.link.startsWith(AUTO_LINK_PREFIX);
    setForm({ editingId: s.id, date: s.date, start: s.start, end: s.end, capacity: String(s.capacity), linkMode: isAuto ? 'auto' : 'own', link: isAuto ? '' : s.link });
    setErrors({}); setSubmitError('');
  }
  function cancelSlot(s: EmployerSlot) {
    if (!window.confirm('Cancel this interview slot?')) return;
    remove.mutate(s.id, { onError: (err) => setSubmitError(errMsg(err)) });
  }
  const fieldCls = (k: string) => `field${errors[k] ? ' show-err' : ''}`;
  const saving = create.isPending || update.isPending;

  // Gate the form on the drive query settling (mirrors EmployerDriveDetail's isLoading branch):
  // without this, the date <select> mounts with zero <option>s (eventDates defaults to []) for
  // the render(s) before the drive fetch resolves, so anything that reads/sets its value in that
  // window (tests included) races the network.
  if (drive.isLoading) {
    return (
      <div className="page-wrap">
        <div className="card" style={{ padding: 20, color: 'var(--grey)' }}>Loading drive…</div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to drive
      </button>
      <div className="card slot-ctx">
        <h2>Interview slots — {drive.data?.name ?? '…'}</h2>
        <p className="hint">Create the interview windows your panel will run for this drive. Dates follow the drive schedule.</p>
      </div>

      <div className="slot-layout">
        <div className="card">
          <div className="card-head"><h3>{form.editingId ? 'Reschedule slot' : 'Add a slot'}</h3></div>
          <div className="card-body" style={{ display: 'grid', gap: 12 }}>
            <div className={fieldCls('date')}>
              <label htmlFor="slot-date">Date</label>
              <select id="slot-date" className={`select${errors.date ? ' err' : ''}`} value={form.date} onChange={(e) => set('date', e.target.value)}>
                <option value="">Select a date…</option>
                {eventDates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
              </select>
              <div className="err-msg">Pick a date from the drive schedule.</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className={fieldCls('start')} style={{ flex: 1 }}>
                <label htmlFor="slot-start">Start</label>
                <input id="slot-start" type="time" className={`input${errors.start ? ' err' : ''}`} value={form.start} onChange={(e) => set('start', e.target.value)} />
                <div className="err-msg">Required.</div>
              </div>
              <div className={fieldCls('end')} style={{ flex: 1 }}>
                <label htmlFor="slot-end">End</label>
                <input id="slot-end" type="time" className={`input${errors.end ? ' err' : ''}`} value={form.end} onChange={(e) => set('end', e.target.value)} />
                <div className="err-msg">End must be after start.</div>
              </div>
            </div>
            <div className={fieldCls('capacity')}>
              <label htmlFor="slot-cap">Capacity</label>
              <input id="slot-cap" type="number" min={1} max={50} className={`input${errors.capacity ? ' err' : ''}`} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
              <div className="err-msg">Enter 1–50.</div>
            </div>
            <div className={fieldCls('link')}>
              <label>Meeting link</label>
              <div className="link-opt-group" style={{ display: 'grid', gap: 8 }}>
                <label className={`link-opt${form.linkMode === 'auto' ? ' on' : ''}`}>
                  <input type="radio" name="linkMode" checked={form.linkMode === 'auto'} onChange={() => set('linkMode', 'auto')} />
                  Generate a Hiringhood link
                </label>
                <label className={`link-opt${form.linkMode === 'own' ? ' on' : ''}`}>
                  <input type="radio" name="linkMode" checked={form.linkMode === 'own'} onChange={() => set('linkMode', 'own')} />
                  Use my own link
                </label>
                {form.linkMode === 'own' && (
                  <input type="url" className={`input${errors.link ? ' err' : ''}`} placeholder="https://…" value={form.link} onChange={(e) => set('link', e.target.value)} />
                )}
              </div>
              <div className="err-msg">A meeting link is required.</div>
            </div>
            {submitError && <div className="otp-err">{submitError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
                {form.editingId ? 'Save changes' : 'Add slot'}
              </button>
              {form.editingId && <button type="button" className="btn btn-ghost" onClick={() => { setForm(EMPTY); setErrors({}); }}>Cancel edit</button>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Scheduled slots</h3></div>
          <div className="card-body">
            {slots.isLoading ? <p className="hint">Loading slots…</p>
              : slots.isError ? <p className="hint">{errMsg(slots.error)}</p>
              : items.length === 0 ? <p className="hint">No slots yet — add your first interview window.</p>
              : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {items.map((s) => (
                    <div className="slot-row" key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div className="fact">
                        <div className="fv">{s.start} – {s.end}</div>
                        <div className="fl">{fmtDate(s.date)} · {s.capacity - s.booked} of {s.capacity} seats left</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn btn-ghost" onClick={() => startEdit(s)}>Reschedule</button>
                        <button type="button" className="btn btn-ghost" onClick={() => cancelSlot(s)}>Cancel</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
