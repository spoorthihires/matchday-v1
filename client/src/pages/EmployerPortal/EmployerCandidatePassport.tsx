import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCandidatePassport, useCandidateMutations, useRevealMutations } from './hooks/useEmployerCandidates.js';
import type { CandidateDecision } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }

export function EmployerCandidatePassport() {
  const { id, jobseekerId } = useParams();
  const driveId = id!;
  const jsId = jobseekerId!;
  const navigate = useNavigate();
  const passport = useCandidatePassport(driveId, jsId);
  const { setDecision, addNote } = useCandidateMutations(driveId);
  const { requestReveal, remindReveal, withdrawReveal } = useRevealMutations(driveId);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState(false);
  const p = passport.data;

  const decide = (decision: CandidateDecision) =>
    setDecision.mutate({ jobseekerId: jsId, decision: p?.decision === decision ? null : decision });
  const submitNote = () => {
    if (!note.trim()) { setNoteErr(true); return; }
    setNoteErr(false);
    addNote.mutate({ jobseekerId: jsId, text: note.trim() }, { onSuccess: () => setNote('') });
  };

  if (passport.isLoading) return <div className="page-wrap"><div className="card" style={{ padding: 20 }}>Loading passport…</div></div>;
  if (passport.isError || !p) return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/candidates`)}>← Back to jobseekers</button>
      <div className="card" style={{ padding: 20 }}><h3>Jobseeker not found</h3><p className="hint">This jobseeker isn&apos;t in this drive&apos;s pool.</p></div>
    </div>
  );

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/candidates`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to jobseekers
      </button>

      <div className="card pp-snap-head">
        <span className="ps-av">
          <svg className="ic ic-lg" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></svg>
        </span>
        <div>
          <div className="ps-id">{p.code} <span className={`status-pill ${p.evalPill === 'Strong' ? 'st-approved' : 'st-inprog'}`}>{p.evalPill}</span></div>
          {p.revealed
            ? <div className="ps-anon" style={{ color: 'var(--green, #067647)' }}>
                <svg className="ic" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><path d="M5 12l5 5L20 7" /></svg>
                {p.revealed.name} · {p.revealed.email} · {p.revealed.institute}, {p.revealed.city}
              </div>
            : <div className="ps-anon">
                <svg className="ic" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                Identity hidden — redacted passport. Match score {p.matchScore}.
              </div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Facts</h3></div>
        <div className="card-body">
          <div className="pp-facts dd-facts">
            <div className="fact"><div><div className="fv">{p.branch}</div><div className="fl">Branch</div></div></div>
            <div className="fact"><div><div className="fv">{p.gradYear}</div><div className="fl">Grad year</div></div></div>
            <div className="fact"><div><div className="fv">{p.cgpaBand}</div><div className="fl">CGPA band</div></div></div>
            <div className="fact"><div><div className="fv">{p.source}</div><div className="fl">Source</div></div></div>
            <div className="fact"><div><div className="fv">{p.instituteCategory}</div><div className="fl">Institute (name hidden)</div></div></div>
            <div className="fact"><div><div className="fv">{p.evaluationLabel}</div><div className="fl">Evaluation</div></div></div>
            <div className="fact"><div><div className="fv">{p.stage}</div><div className="fl">Stage</div></div></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Match score — {p.matchScore}</h3></div>
        <div className="card-body" style={{ display: 'grid', gap: 8 }}>
          {([['CGPA', p.factors.cgpa], ['Evaluation', p.factors.evaluation], ['Stage', p.factors.stage]] as const).map(([label, f]) => (
            <div key={label} className="fact" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="fl">{label} (weight {Math.round(f.weight * 100)}%)</span>
              <span className="fv">+{f.contribution}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Decision</h3></div>
        <div className="card-body" style={{ display: 'flex', gap: 8 }}>
          <button type="button" className={`btn ${p.decision === 'Shortlisted' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide('Shortlisted')}>Shortlist</button>
          <button type="button" className={`btn ${p.decision === 'Hold' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide('Hold')}>Hold</button>
          <button type="button" className={`btn ${p.decision === 'Rejected' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide('Rejected')}>Reject</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Identity reveal</h3></div>
        <div className="card-body" style={{ display: 'grid', gap: 8 }}>
          {(() => {
            const c = p.consent;
            const st = !c ? 'none' : c.status === 'requested' ? (c.expired ? 'expired' : 'waiting') : c.status === 'granted' ? 'interested' : 'declined';
            const busy = requestReveal.isPending || remindReveal.isPending || withdrawReveal.isPending;
            const label = { none: 'Not requested', waiting: 'Waiting for the jobseeker to consent', expired: 'Request expired', interested: 'Consent granted — identity revealed', declined: 'Jobseeker declined' }[st];
            return (
              <>
                <p className="hint">{label}{st === 'waiting' && c?.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}` : ''}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {st === 'none' && <button type="button" className="btn btn-primary" disabled={busy || p.decision !== 'Shortlisted'} onClick={() => requestReveal.mutate(jsId)}>Request reveal</button>}
                  {(st === 'waiting' || st === 'expired') && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => remindReveal.mutate(jsId)}>Send reminder</button>}
                  {(st === 'waiting' || st === 'expired') && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => withdrawReveal.mutate(jsId)}>Withdraw</button>}
                </div>
                {st === 'none' && p.decision !== 'Shortlisted' && <p className="hint">Shortlist this jobseeker to request a reveal.</p>}
              </>
            );
          })()}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Internal notes <span className="hint">(private to your team)</span></h3></div>
        <div className="card-body" style={{ display: 'grid', gap: 10 }}>
          {p.notes.length === 0 ? <p className="hint">No notes yet.</p> : p.notes.map((n, i) => (
            <div key={i} className="fact"><div><div className="fv">{n.text}</div><div className="fl">{n.by} · {new Date(n.at).toLocaleDateString()}</div></div></div>
          ))}
          <div className={`field${noteErr ? ' show-err' : ''}`}>
            <textarea className={`input${noteErr ? ' err' : ''}`} placeholder="Add a private note…" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            <div className="err-msg">A note can&apos;t be empty.</div>
          </div>
          {addNote.isError && <div className="otp-err">{errMsg(addNote.error)}</div>}
          <div><button type="button" className="btn btn-primary" disabled={addNote.isPending} onClick={submitNote}>Add note</button></div>
        </div>
      </div>
    </div>
  );
}
