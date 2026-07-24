import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerCandidates } from './hooks/useEmployerCandidates.js';
import { useEmployerSlots } from './hooks/useEmployerSlots.js';
import { useEmployerInterviews, useScheduleInterview, useInterviewAction } from './hooks/useEmployerInterviews.js';
import type { EmployerInterview } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

// Ported per the Slice 7 (interviews) task brief. Renders inside EmployerShell's ".page active"
// content area -- intentionally does NOT re-wrap in ".employer-app" (only ".page-wrap"), same
// convention as EmployerCandidates.tsx/EmployerConsent.tsx/EmployerSlots.tsx. Reuses the ported
// .reveal/.mlink/.status-pill/.intv-people/.ip/.cand-row/.cand-empty CSS (employer.css).
//
// Ships schedule + confirm/complete/cancel. Reschedule + per-row set-interviewers are
// server-complete (Task 2's PATCH accepts both actions) but intentionally left off this first
// cut of the UI to keep the page focused -- wire them in a follow-up slice.

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }
const STATUS_CLS: Record<string, string> = { Scheduled: 'st-inprog', Confirmed: 'st-approved', Cancelled: 'st-cancelled', Completed: 'st-approved' };

export function EmployerInterviews() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const interviews = useEmployerInterviews(driveId);
  const candidates = useEmployerCandidates(driveId, { decision: 'Shortlisted' });
  const slots = useEmployerSlots(driveId);
  const schedule = useScheduleInterview(driveId);
  const action = useInterviewAction(driveId);

  const grantedCands = (candidates.data?.items ?? []).filter((c) => c.consent?.status === 'granted');
  const slotItems = (slots.data?.items ?? []).filter((s) => s.status !== 'Cancelled');

  const [jobseekerId, setJobseekerId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [time, setTime] = useState('');
  const [interviewers, setInterviewers] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  // default the slot + time to the first slot / its start
  useEffect(() => {
    if (!slotId && slotItems.length) { setSlotId(slotItems[0].id); setTime(slotItems[0].start); }
  }, [slotItems, slotId]);
  useEffect(() => { if (!jobseekerId && grantedCands.length) setJobseekerId(grantedCands[0].jobseekerId); }, [grantedCands, jobseekerId]);

  const submit = () => {
    if (!jobseekerId || !slotId || !/^\d{2}:\d{2}$/.test(time)) { setFormErr('Pick a candidate, a slot and a valid time.'); return; }
    setFormErr(null);
    const names = interviewers.split(',').map((s) => s.trim()).filter(Boolean);
    schedule.mutate({ jobseekerId, slotId, time, interviewers: names.length ? names : undefined }, { onSuccess: () => setInterviewers('') });
  };

  const items = useMemo(() => interviews.data?.items ?? [], [interviews.data]);

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/candidates`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to jobseekers
      </button>
      <div className="card"><h2>Interview schedule</h2><p className="hint">Schedule consented candidates into your slots — confirm, reschedule, or cancel.</p></div>

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h3>Schedule an interview</h3>
        {grantedCands.length === 0
          ? <p className="hint">No consented candidates yet. A candidate must grant a reveal request (Consent status) before you can schedule an interview.</p>
          : slotItems.length === 0
          ? <p className="hint">No slots yet. Create a slot first (View slots) to schedule interviews into it.</p>
          : (
            <div className={`field${formErr ? ' show-err' : ''}`} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="select" aria-label="Candidate" value={jobseekerId} onChange={(e) => setJobseekerId(e.target.value)} style={{ maxWidth: 220 }}>
                {grantedCands.map((c) => <option key={c.jobseekerId} value={c.jobseekerId}>{c.revealed?.name ?? c.code} · {c.code}</option>)}
              </select>
              <select className="select" aria-label="Slot" value={slotId} onChange={(e) => { setSlotId(e.target.value); const s = slotItems.find((x) => x.id === e.target.value); if (s) setTime(s.start); }} style={{ maxWidth: 220 }}>
                {slotItems.map((s) => <option key={s.id} value={s.id}>{new Date(s.date).toLocaleDateString()} · {s.start}–{s.end}</option>)}
              </select>
              <input className="input" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} placeholder="HH:MM" style={{ maxWidth: 100 }} />
              <input className="input" aria-label="Interviewers" value={interviewers} onChange={(e) => setInterviewers(e.target.value)} placeholder="Interviewers (comma-separated)" style={{ maxWidth: 240 }} />
              <button type="button" className="btn btn-primary" disabled={schedule.isPending} onClick={submit}>Schedule interview</button>
              <div className="err-msg">{formErr}</div>
            </div>
          )}
        {schedule.isError && <p className="otp-err" role="alert">{errMsg(schedule.error)}</p>}
      </div>

      <div className="card">
        {interviews.isLoading ? <p className="hint">Loading…</p>
          : interviews.isError ? <p className="hint">{errMsg(interviews.error)}</p>
          : items.length === 0 ? <p className="cand-empty hint">No interviews scheduled yet.</p>
          : (
            <div style={{ display: 'grid', gap: 10 }}>
              {items.map((iv: EmployerInterview) => (
                <div className="cand-row" key={iv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line, #eee)' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="reveal"><div className="rn">{iv.name}</div><div className="re">{iv.code} · {iv.slot ? new Date(iv.slot.date).toLocaleDateString() : '—'}</div></div>
                    <span className="intv-time" style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{iv.time}</span>
                    {iv.slot?.link && <span className="mlink"><a href={iv.slot.link} target="_blank" rel="noopener">Join</a></span>}
                    {iv.interviewers.length > 0 && <div className="intv-people">{iv.interviewers.map((n) => <span className="ip" key={n}>{n}</span>)}</div>}
                    <span className={`status-pill ${STATUS_CLS[iv.status] ?? 'st-inprog'}`}>{iv.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {iv.status !== 'Cancelled' && iv.status !== 'Completed' && <>
                      <button type="button" className="btn btn-ghost" disabled={action.isPending} onClick={() => action.mutate({ interviewId: iv.id, action: { action: 'confirm' } })}>Confirm</button>
                      <button type="button" className="btn btn-ghost" disabled={action.isPending} onClick={() => action.mutate({ interviewId: iv.id, action: { action: 'complete' } })}>Complete</button>
                      <button type="button" className="btn btn-ghost" disabled={action.isPending} onClick={() => action.mutate({ interviewId: iv.id, action: { action: 'cancel' } })}>Cancel</button>
                    </>}
                  </div>
                </div>
              ))}
            </div>
          )}
        {action.isError && <p className="otp-err" role="alert">{errMsg(action.error)}</p>}
      </div>
    </div>
  );
}
