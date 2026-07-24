import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerCandidates, useRevealMutations } from './hooks/useEmployerCandidates.js';
import { useEmployerDrive } from './hooks/useEmployerDrives.js';
import type { EmployerCandidate } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

// Ported from the prototype's Screen 16 "Candidate consent status" (#page-consent). Renders
// inside EmployerShell's ".page active" area (no ".employer-app" re-wrap), same convention as
// EmployerCandidates.tsx. Reuses the ported .reveal/.status-pill/.cand-* CSS.

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }

function derivedStatus(c: EmployerCandidate): 'none' | 'waiting' | 'interested' | 'declined' | 'expired' {
  const s = c.consent?.status;
  if (!s) return 'none';
  if (s === 'requested') return c.consent?.expired ? 'expired' : 'waiting';
  if (s === 'granted') return 'interested';
  return 'declined';
}
const STATUS_META: Record<string, { label: string; cls: string }> = {
  none: { label: 'Not requested', cls: 'st-draft' },
  waiting: { label: 'Waiting consent', cls: 'st-inprog' },
  interested: { label: 'Interested', cls: 'st-approved' },
  declined: { label: 'Declined', cls: 'st-cancelled' },
  expired: { label: 'Expired', cls: 'st-draft' },
};

export function EmployerConsent() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const drive = useEmployerDrive(driveId);
  const candidates = useEmployerCandidates(driveId, { decision: 'Shortlisted' });
  const { requestReveal, remindReveal, withdrawReveal } = useRevealMutations(driveId);
  const items = candidates.data?.items ?? [];

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/candidates`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to jobseekers
      </button>
      <div className="card">
        <h2>Jobseeker consent — {drive.data?.name ?? '…'}</h2>
        <p className="cand-privacy hint">Identities are revealed only after a jobseeker consents. Request a reveal for your shortlisted jobseekers; requests expire in 48h if unanswered.</p>
      </div>

      <div className="card">
        {candidates.isLoading ? <p className="hint">Loading…</p>
          : candidates.isError ? <p className="hint">{errMsg(candidates.error)}</p>
          : items.length === 0 ? <p className="cand-empty hint">No shortlisted jobseekers yet — shortlist jobseekers to request their consent.</p>
          : (
            <div style={{ display: 'grid', gap: 8 }}>
              {items.map((c) => {
                const st = derivedStatus(c);
                const meta = STATUS_META[st];
                const busy = requestReveal.isPending || remindReveal.isPending || withdrawReveal.isPending;
                return (
                  <div className="cand-row" key={c.jobseekerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line, #eee)' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span className="match-ring" title="Match score">{c.matchScore}</span>
                      <div className="fact">
                        {c.revealed
                          ? <div className="reveal"><div className="rn">{c.revealed.name}</div><div className="re">{c.revealed.email} · {c.revealed.institute}</div></div>
                          : <div className="fv">{c.code}</div>}
                        <div className="fl">
                          <span className={`status-pill ${meta.cls}`}>{meta.label}</span>
                          {st === 'waiting' && c.consent?.expiresAt ? ` · expires ${new Date(c.consent.expiresAt).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {st === 'none' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => requestReveal.mutate(c.jobseekerId)}>Request reveal</button>}
                      {(st === 'waiting' || st === 'expired') && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => remindReveal.mutate(c.jobseekerId)}>Send reminder</button>}
                      {(st === 'waiting' || st === 'expired') && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => withdrawReveal.mutate(c.jobseekerId)}>Withdraw</button>}
                      <button type="button" className="btn btn-ghost" onClick={() => navigate(`/employer/drives/${driveId}/candidates/${c.jobseekerId}`)}>Passport</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
