import type { PortalJourney } from '../../types/portal.js';

export function StatusCards({ journey }: { journey: PortalJourney }) {
  return (
    <div className="stat-row">
      <div className="card stat"><div className="k">Match readiness</div><div className="v">{journey.matchReadinessPct}%</div></div>
      <div className="card stat"><div className="k">Evaluation</div><div className="v">{journey.evaluationLabel}</div></div>
      <div className="card stat"><div className="k">Offer status</div><div className="v">{journey.offerStatus}</div></div>
    </div>
  );
}
