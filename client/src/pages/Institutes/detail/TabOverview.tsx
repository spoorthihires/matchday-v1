import type { Funnel, InstituteDetailResponse } from '../../../types/institutes.js';

// Ported from matchday-admin-app_23.html renderIdOverview() (lines ~3866-3878): two `.rev-card`
// panels (Profile / Participation) plus a full-width funnel-snapshot `.rev-card` whose `.rc-edit`
// jumps to the Funnel Analytics tab (the prototype wires this via `data-jump="funnel"` +
// `$('#idTabs button[data-tab="funnel"]').click()`; here the parent just hands down a callback).
//
// The prototype's Profile/Participation rows also include "Drives assigned" and "Last activity" —
// dropped here because the detail payload (institutes.service.ts#getInstitute) has no
// drives-assignment count (institute↔drive assignment isn't in this build; see
// TabDrivesComingSoon) and no activity-timestamp field at this layer (Task 7's Audit tab will
// carry real timestamps via AuditRow).

type Institute = InstituteDetailResponse['institute'];

function row(k: string, v: string) {
  return (
    <div className="rev-row" key={k}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TabOverview({
  institute, funnel, onOpenFunnel,
}: { institute: Institute; funnel: Funnel; onOpenFunnel: () => void }) {
  const steps: [string, number, number][] = [
    ['Uploaded', funnel.uploaded, 100],
    ['Signed up', Math.round((funnel.uploaded * funnel.signupPct) / 100), funnel.signupPct],
    ['Completed', Math.round((funnel.uploaded * funnel.completionPct) / 100), funnel.completionPct],
    ['Match-ready', Math.round((funnel.uploaded * funnel.matchReadyPct) / 100), funnel.matchReadyPct],
    ['Shortlisted', Math.round((funnel.uploaded * funnel.shortlistPct) / 100), funnel.shortlistPct],
    ['Offers', Math.round((funnel.uploaded * funnel.offerPct) / 100), funnel.offerPct],
    ['Joined', Math.round((funnel.uploaded * funnel.joinedPct) / 100), funnel.joinedPct],
  ];

  return (
    <div className="info-grid">
      <div className="rev-card">
        <div className="rc-h"><b>Profile</b></div>
        {row('Type', institute.type)}
        {row('City', institute.city)}
        {row('Owner / SPOC', institute.owner)}
        {row('Contact', institute.email)}
        {row('Status', institute.status)}
        {row('Member since', fmtDate(institute.createdAt))}
      </div>
      <div className="rev-card">
        <div className="rc-h"><b>Participation</b></div>
        {row('Candidates uploaded', funnel.uploaded.toLocaleString('en-IN'))}
        {row('Match-ready rate', `${funnel.matchReadyPct}%`)}
        {row('Shortlist rate', `${funnel.shortlistPct}%`)}
        {row('Offer rate', `${funnel.offerPct}%`)}
        {row('Join rate', `${funnel.joinedPct}%`)}
      </div>
      <div className="rev-card full">
        <div className="rc-h">
          <b>Funnel snapshot</b>
          <span className="rc-edit" role="button" tabIndex={0} onClick={onOpenFunnel}>Open analytics</span>
        </div>
        <div className="funnel" style={{ padding: '6px 0 0' }}>
          {steps.map(([name, value, p]) => (
            <div className="fstep" key={name}>
              <div className="fl">
                <span className="name">{name}</span>
                <span className="v mono">
                  {value.toLocaleString('en-IN')} <span className="pct">{p}%</span>
                </span>
              </div>
              <div className="ftrack">
                <i style={{ width: `${Math.max(3, p)}%`, background: 'linear-gradient(90deg,#2f4fe0,#5a74ee)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
