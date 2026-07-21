import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerCandidates, useCandidateMutations } from './hooks/useEmployerCandidates.js';
import { useEmployerDrive } from './hooks/useEmployerDrives.js';
import { useBulkDecision, fetchShortlistPack } from './hooks/useEmployerShortlist.js';
import { useAuth } from '../../auth/AuthContext.js';
import type { CandidateDecision, EmployerCandidate } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

// Ported from the prototype's Screen 15 "Shortlist workspace" (#page-shortlist). Renders inside
// EmployerShell's ".page active" area (no ".employer-app" re-wrap). Loads the FULL pool (no server
// decision filter) so summary counts stay stable; search/eval/decision filtering is client-side.
// Reuses the ported .deadline-banner/.cand-sumchip/.bulk-bar/.chkbox/.match-ring/.status-pill CSS.

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }

function deadlineInfo(primaryEventDate: string | null | undefined) {
  if (!primaryEventDate) return null;
  const close = new Date(new Date(primaryEventDate).getTime() - 24 * 3600 * 1000);
  const ms = close.getTime() - Date.now();
  const closed = ms <= 0;
  const h = Math.max(0, Math.floor(ms / 3600000)); const d = Math.floor(h / 24); const hr = h % 24;
  const remaining = closed ? 'Closed' : d > 0 ? `${d}d ${hr}h` : `${hr}h`;
  const urgency: 'crit' | 'warn' | 'ok' = closed || h < 24 ? 'crit' : h < 48 ? 'warn' : 'ok';
  return { close, closed, remaining, urgency };
}

const CHIPS: { key: string; label: string; color?: string }[] = [
  { key: 'all', label: 'All' }, { key: 'Shortlisted', label: 'Shortlisted', color: 'var(--green)' },
  { key: 'Hold', label: 'Hold', color: 'var(--amber)' }, { key: 'Rejected', label: 'Rejected', color: '#e0463c' },
  { key: 'undecided', label: 'Undecided', color: 'var(--grey-2)' },
];

export function EmployerShortlist() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const { token } = useAuth();
  const drive = useEmployerDrive(driveId);
  const candidates = useEmployerCandidates(driveId, {});   // full pool — counts stay stable
  const { setDecision } = useCandidateMutations(driveId);
  const bulk = useBulkDecision(driveId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [evalf, setEvalf] = useState('');
  const [dec, setDec] = useState('all');
  const [downloading, setDownloading] = useState(false);

  const all = candidates.data?.items ?? [];
  const counts = useMemo(() => {
    const c = { all: all.length, Shortlisted: 0, Hold: 0, Rejected: 0, undecided: 0 };
    for (const it of all) { if (it.decision) c[it.decision] += 1; else c.undecided += 1; }
    return c;
  }, [all]);

  const rows = all.filter((c) => {
    if (evalf && c.evalPill !== evalf) return false;
    if (dec === 'undecided' ? c.decision !== null : dec !== 'all' && c.decision !== dec) return false;
    if (q.trim() && !(`${c.code} ${c.branch}`.toLowerCase().includes(q.trim().toLowerCase()))) return false;
    return true;
  });

  const toggle = (jsId: string) => setSelected((s) => { const n = new Set(s); n.has(jsId) ? n.delete(jsId) : n.add(jsId); return n; });
  const allSelected = rows.length > 0 && rows.every((c) => selected.has(c.jobseekerId));
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (rows.every((c) => n.has(c.jobseekerId))) rows.forEach((c) => n.delete(c.jobseekerId));
    else rows.forEach((c) => n.add(c.jobseekerId));
    return n;
  });
  const runBulk = (decision: 'Shortlisted' | 'Hold' | 'Rejected') =>
    bulk.mutate({ jobseekerIds: [...selected], decision }, { onSuccess: () => setSelected(new Set()) });
  const decide = (c: EmployerCandidate, decision: CandidateDecision) =>
    setDecision.mutate({ jobseekerId: c.jobseekerId, decision: c.decision === decision ? null : decision });

  const downloadPack = async () => {
    setDownloading(true);
    try {
      const pack = await fetchShortlistPack(driveId, token);
      const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const head = ['Code', 'Match', 'Evaluation', 'Branch', 'Grad year', 'CGPA band', 'Institute category', 'Stage', 'Consent', 'Notes'];
      const lines = pack.items.map((it) => [it.code, it.matchScore, it.evalPill, it.branch, it.gradYear, it.cgpaBand, it.instituteCategory, it.stage, it.consentStatus, it.notes.join(' | ')].map(esc).join(','));
      const csv = [`MatchDay Shortlist Pack — ${pack.driveName} — identities redacted`, head.map(esc).join(','), ...lines].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = `shortlist-pack-${driveId}.csv`; a.click(); URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  };

  const dl = deadlineInfo(drive.data?.primaryEventDate);

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/candidates`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to candidates
      </button>
      <div className="card">
        <h2>Shortlist workspace — {drive.data?.name ?? '…'}</h2>
        <p className="hint">Review, decide and package your shortlist. Identities stay redacted until a candidate confirms interest.</p>
      </div>

      {dl && (
        <div className={`deadline-banner ${dl.urgency}`}>
          <span className="db-ic"><svg className="ic ic-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
          <div>
            <div className="db-t">{dl.closed ? 'Shortlisting window has closed' : `Shortlisting closes ${dl.close.toLocaleDateString()}`}</div>
            <div className="db-s">Closes 24h before your MatchDay slot. This is a reminder — decisions stay open.</div>
          </div>
          <div className="db-count"><div className="n">{dl.remaining}</div><div className="l">{dl.closed ? 'window closed' : 'remaining'}</div></div>
        </div>
      )}
      {!dl && <p className="hint">No slot scheduled yet — shortlisting stays open.</p>}

      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" placeholder="Search by code or branch" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
        <select className="select" value={evalf} onChange={(e) => setEvalf(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">All evaluations</option><option value="Strong">Strong</option><option value="Qualified">Qualified</option>
        </select>
        <span style={{ marginLeft: 'auto' }} />
        <button type="button" className="btn btn-ghost" disabled={downloading} onClick={downloadPack}>Download shortlist pack</button>
        <button type="button" className="btn btn-primary" onClick={() => navigate(`/employer/drives/${driveId}/consent`)}>Consent status</button>
      </div>

      <div className="cand-summary" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0' }}>
        {CHIPS.map((ch) => (
          <button type="button" key={ch.key} className={`cand-sumchip ${dec === ch.key ? 'on' : ''}`} onClick={() => setDec(ch.key)}>
            {ch.color && <span className="dotc" style={{ background: ch.color }} />}{ch.label} <b>{counts[ch.key as keyof typeof counts]}</b>
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bb-n">{selected.size} selected</span>
          <button type="button" onClick={() => runBulk('Shortlisted')}>Bulk shortlist</button>
          <button type="button" onClick={() => runBulk('Hold')}>Bulk hold</button>
          <button type="button" onClick={() => runBulk('Rejected')}>Bulk reject</button>
          <span className="bb-sp" />
          <button type="button" className="clear" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="card">
        {candidates.isLoading ? <p className="hint">Loading candidates…</p>
          : candidates.isError ? <p className="hint">{errMsg(candidates.error)}</p>
          : all.length === 0 ? <p className="cand-empty hint">No candidates in this drive's pool yet.</p>
          : (
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--grey)' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Select all ({rows.length})
              </label>
              {rows.map((c) => (
                <div className="cand-row" key={c.jobseekerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line, #eee)' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <input type="checkbox" checked={selected.has(c.jobseekerId)} onChange={() => toggle(c.jobseekerId)} aria-label={`Select ${c.code}`} />
                    <span className="match-ring" title="Match score">{c.matchScore}</span>
                    <div className="fact">
                      <div className="fv">{c.code} <span className={`status-pill ${c.evalPill === 'Strong' ? 'st-approved' : 'st-inprog'}`}>{c.evalPill}</span></div>
                      <div className="fl">{c.branch} · {c.gradYear} · CGPA {c.cgpaBand} · {c.stage}{c.decision ? ` · ${c.decision}` : ''}{c.consent ? ` · consent: ${c.consent.expired ? 'expired' : c.consent.status}` : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => navigate(`/employer/drives/${driveId}/candidates/${c.jobseekerId}`)}>Passport</button>
                    <button type="button" className={`btn ${c.decision === 'Shortlisted' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide(c, 'Shortlisted')}>Shortlist</button>
                    <button type="button" className={`btn ${c.decision === 'Hold' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide(c, 'Hold')}>Hold</button>
                    <button type="button" className={`btn ${c.decision === 'Rejected' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => decide(c, 'Rejected')}>Reject</button>
                  </div>
                </div>
              ))}
              {rows.length === 0 && <p className="hint">No candidates match these filters.</p>}
            </div>
          )}
      </div>
    </div>
  );
}
