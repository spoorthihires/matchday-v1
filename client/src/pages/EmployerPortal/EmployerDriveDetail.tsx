import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerDrive } from './hooks/useEmployerDrives.js';
import { useEmployerRegistrations } from './hooks/useEmployerRegistrations.js';
import type { EmployerDriveDetail as EmployerDriveDetailType } from '../../types/employer.js';
import './employerBase.js';

// Ported from the prototype Matchday_Employer.html's #page-drive-detail (~2827-2919): the
// .dd-hero/.dd-hero-grid overview (icon + status pill + name/stream + .dd-facts) and the
// .dd-action CTA rail (~2834-2865), plus the .dd-grid secondary-panel scaffolding (~2867-2914).
// Renders inside EmployerShell's ".page active" content area (App.tsx), which already provides
// the ".employer-app" CSS scope — this component intentionally does NOT re-wrap in
// ".employer-app" (only ".page-wrap", same convention as EmployerDashboard.tsx/EmployerDrives.tsx).
//
// The prototype's .dd-grid holds candidate-pool/skills/location/experience/CTC-distribution
// panels — all purely-synthetic demo stats (mkt.js) with no equivalent in this slice's data
// model (GET /api/me/employer/drives/:id returns facts + eligibility + evaluation, no pool
// data). So this ports the hero/facts/action scaffolding faithfully but swaps those synthetic
// panels for the two real panels the API actually returns: an eligibility panel
// (sources/branches/gradYears/expType) and an evaluation-flow panel (the enabled `evaluation`
// stages in order), both built from the existing generic .card/.card-head/.card-body
// scaffolding (same pattern as EmployerDashboard.tsx's Registrations/Shortlist cards) since the
// prototype never had dedicated classes for this content. The evaluation stage rows reuse the
// landing page's `.cover`/`.ck` "check item" component (employer.css ~288-294) — a generic
// icon+title+description row that fits an enabled-stage list well.

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Mirrors EmployerDrives.tsx's registrationMeta (duplicated here rather than shared/exported —
// it's a two-line status->pill-class map, not worth a shared util for two call sites).
function regStatusMeta(employerReg: string): { cls: string; label: string } {
  if (employerReg === 'Open') return { cls: 'st-open', label: 'Registration open' };
  if (employerReg === 'Closed') return { cls: 'st-closed', label: 'Registration closed' };
  return { cls: 'st-wait', label: employerReg };
}

function formatConfig(config: Record<string, number>): string {
  const entries = Object.entries(config);
  if (entries.length === 0) return 'No configuration set';
  return entries.map(([k, v]) => `${k}: ${v}`).join(' · ');
}

function EligibilityPanel({ eligibility }: { eligibility: EmployerDriveDetailType['eligibility'] }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <svg className="ic ic-sm" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0" /></svg>
          Eligibility
        </h3>
      </div>
      <div className="card-body">
        <div className="dd-facts">
          <div className="fact">
            <div><div className="fv">{eligibility.sources.join(', ') || '—'}</div><div className="fl">Sources</div></div>
          </div>
          <div className="fact">
            <div><div className="fv">{eligibility.branches.join(', ') || '—'}</div><div className="fl">Branches</div></div>
          </div>
          <div className="fact">
            <div><div className="fv">{eligibility.gradYears.join(', ') || '—'}</div><div className="fl">Grad years</div></div>
          </div>
          <div className="fact">
            <div><div className="fv">{eligibility.expType || '—'}</div><div className="fl">Experience type</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvaluationFlowPanel({ evaluation }: { evaluation: EmployerDriveDetailType['evaluation'] }) {
  const enabledStages = evaluation.filter((stage) => stage.enabled);
  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
          Evaluation flow
        </h3>
      </div>
      <div className="card-body">
        {enabledStages.length === 0 ? (
          <p className="hint">No evaluation stages are enabled for this drive yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {enabledStages.map((stage, i) => (
              <div className="cover" key={stage.key}>
                <span className="ck">{i + 1}</span>
                <div>
                  <h4 style={{ textTransform: 'capitalize' }}>{stage.key}</h4>
                  <p>{formatConfig(stage.config)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EmployerDriveDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useEmployerDrive(id!);
  const { data: regsData } = useEmployerRegistrations();
  const approvedForDrive = (regsData?.items ?? []).some((r) => r.driveId === id && r.status === 'Approved');

  if (isLoading) {
    return (
      <div className="page-wrap">
        <div className="card" style={{ padding: 20, color: 'var(--grey)' }}>Loading drive…</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page-wrap">
        <button type="button" className="link-back dd-back" onClick={() => navigate('/employer/drives')}>
          <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to available drives
        </button>
        <div className="card" style={{ padding: 20 }}>
          <h3>Drive not found</h3>
          <p className="hint">This drive isn&apos;t available — it may have been archived, or the link may be incorrect.</p>
        </div>
      </div>
    );
  }

  const reg = regStatusMeta(data.employerReg);

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate('/employer/drives')}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to available drives
      </button>

      <div className="card dd-hero">
        <div className="dd-hero-grid">
          <div>
            <span className="d-ic">
              <svg className="ic ic-lg" viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg>
            </span>
            <span className={`status-pill ${reg.cls}`} style={{ marginBottom: 10, display: 'inline-flex' }}>{reg.label}</span>
            <h1>{data.name}</h1>
            <div className="d-stream">{data.domain} · {data.stream}</div>

            <div className="dd-facts">
              <div className="fact">
                <div><div className="fv">{data.month}</div><div className="fl">Next MatchDay month</div></div>
              </div>
              <div className="fact">
                <div><div className="fv">{data.eventDates.length ? data.eventDates.map(formatEventDate).join(', ') : '—'}</div><div className="fl">Event dates</div></div>
              </div>
              <div className="fact">
                <div><div className="fv">{data.candCap}</div><div className="fl">Candidate cap</div></div>
              </div>
              <div className="fact">
                <div><div className="fv">{data.empCap}</div><div className="fl">Employer cap</div></div>
              </div>
              <div className="fact">
                <div><div className="fv">{data.slotCap}</div><div className="fl">Slot cap</div></div>
              </div>
              <div className="fact">
                <div><div className="fv">{data.frequency}</div><div className="fl">Frequency</div></div>
              </div>
              <div className="fact">
                <div><div className="fv">{data.eventDay}</div><div className="fl">Event day</div></div>
              </div>
            </div>
          </div>

          <div className="dd-action">
            <div className="dd-next">
              <span className="n-ic">
                <svg className="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>
              </span>
              <div><div className="nv">{data.eventDay}</div><div className="nl">{data.frequency} MatchDay</div></div>
            </div>
            {data.canRegister && (
              <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate(`/employer/drives/${id}/register`)}>
                Register for this drive
                <svg className="ic" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!approvedForDrive}
              title={approvedForDrive ? undefined : 'Available once your registration is approved'}
              onClick={() => navigate(`/employer/drives/${id}/slots`)}
            >
              View slots
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!approvedForDrive}
              title={approvedForDrive ? undefined : 'Available once your registration is approved'}
              onClick={() => navigate(`/employer/drives/${id}/candidates`)}
            >
              View candidates
            </button>
            <div className="ap-note">
              <svg className="ic" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
              Aggregate data only — no identities
            </div>
          </div>
        </div>
      </div>

      <div className="dd-grid">
        <EligibilityPanel eligibility={data.eligibility} />
        <EvaluationFlowPanel evaluation={data.evaluation} />
      </div>
    </div>
  );
}
