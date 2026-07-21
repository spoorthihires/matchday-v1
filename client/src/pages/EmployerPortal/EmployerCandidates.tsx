import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerCandidates, useCandidateMutations, type CandidateFilters } from './hooks/useEmployerCandidates.js';
import { useEmployerDrive } from './hooks/useEmployerDrives.js';
import type { CandidateDecision, EmployerCandidate } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

// Ported from the prototype Matchday_Employer.html's #page-candidates candidate-pool table
// (.cand-table-wrap/.cand-id/.match-ring/.cand-actions), swapped here for a simpler row-list
// (the brief's own scaffolding) since this slice's data model has no equivalent columns for
// every prototype field (resume/CV, contact). Renders inside EmployerShell's ".page active"
// content area -- intentionally does NOT re-wrap in ".employer-app" (only ".page-wrap"), same
// convention as EmployerDriveDetail.tsx/EmployerSlots.tsx. Reuses the ported .cand-privacy/
// .cand-empty/.match-ring/.chip/.status-pill CSS (employer.css); `.cand-row` is a marker class
// only (no CSS rule for it) so its layout is inline.

const DECISIONS: { key: string; label: string }[] = [
  { key: '', label: 'All' }, { key: 'undecided', label: 'Undecided' },
  { key: 'Shortlisted', label: 'Shortlisted' }, { key: 'Hold', label: 'Hold' }, { key: 'Rejected', label: 'Rejected' },
];
function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }

export function EmployerCandidates() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const drive = useEmployerDrive(driveId);
  const [filters, setFilters] = useState<CandidateFilters>({ q: '', decision: '', evaluation: '' });
  const candidates = useEmployerCandidates(driveId, filters);
  const shortlisted = useEmployerCandidates(driveId, { decision: 'Shortlisted' });
  const { setDecision } = useCandidateMutations(driveId);
  const items = candidates.data?.items ?? [];

  const decide = (c: EmployerCandidate, decision: CandidateDecision) =>
    setDecision.mutate({ jobseekerId: c.jobseekerId, decision: c.decision === decision ? null : decision });

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to drive
      </button>
      <div className="card">
        <h2>Candidates — {drive.data?.name ?? '…'}</h2>
        <p className="cand-privacy hint">Names, contact details and resumes stay hidden. Identity is only revealed after a shortlisted candidate confirms interest.</p>
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-ghost" style={{ marginRight: 6 }}
            onClick={() => navigate(`/employer/drives/${driveId}/shortlist`)}>Shortlist workspace</button>
          <button type="button" className="btn btn-ghost" disabled={!(shortlisted.data?.items?.length)}
            onClick={() => navigate(`/employer/drives/${driveId}/consent`)}>Consent status</button>
          <button type="button" className="btn btn-ghost" style={{ marginLeft: 6 }}
            onClick={() => navigate(`/employer/drives/${driveId}/interviews`)}>Interviews</button>
          <button type="button" className="btn btn-ghost" style={{ marginLeft: 6 }}
            onClick={() => navigate(`/employer/drives/${driveId}/board`)}>Pipeline board</button>
          <button type="button" className="btn btn-ghost" style={{ marginLeft: 6 }}
            onClick={() => navigate(`/employer/drives/${driveId}/offers`)}>Offers</button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" placeholder="Search by code or branch" value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} style={{ maxWidth: 260 }} />
        <select className="select" value={filters.evaluation} onChange={(e) => setFilters((f) => ({ ...f, evaluation: e.target.value }))} style={{ maxWidth: 160 }}>
          <option value="">All evaluations</option><option value="Strong">Strong</option><option value="Qualified">Qualified</option>
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          {DECISIONS.map((d) => (
            <button key={d.key} type="button" className={`fchip${filters.decision === d.key ? ' on' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, decision: d.key }))}>{d.label}</button>
          ))}
        </div>
      </div>

      <div className="card">
        {candidates.isLoading ? <p className="hint">Loading candidates…</p>
          : candidates.isError ? <p className="hint">{errMsg(candidates.error)}</p>
          : items.length === 0 ? <p className="cand-empty hint">No candidates match yet.</p>
          : (
            <div style={{ display: 'grid', gap: 8 }}>
              {items.map((c) => (
                <div className="cand-row" key={c.jobseekerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line, #eee)' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className="match-ring" title="Match score">{c.matchScore}</span>
                    <div className="fact">
                      <div className="fv">{c.code} <span className={`status-pill ${c.evalPill === 'Strong' ? 'st-approved' : 'st-inprog'}`}>{c.evalPill}</span></div>
                      <div className="fl">{c.branch} · {c.gradYear} · CGPA {c.cgpaBand} · {c.instituteCategory} · {c.evaluationLabel} · {c.stage}{c.decision ? ` · ${c.decision}` : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => navigate(`/employer/drives/${driveId}/candidates/${c.jobseekerId}`)}>Passport</button>
                    <button type="button" className={`btn ${c.decision === 'Shortlisted' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide(c, 'Shortlisted')}>Shortlist</button>
                    <button type="button" className="btn btn-ghost" onClick={() => decide(c, 'Hold')}>Hold</button>
                    <button type="button" className="btn btn-ghost" onClick={() => decide(c, 'Rejected')}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
