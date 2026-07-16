import type { PortalJourney } from '../../types/portal.js';

export function JourneyPipeline({ journey }: { journey: PortalJourney }) {
  const currentIdx = journey.stages.indexOf(journey.stage);
  const dropped = journey.stage === 'DroppedOff';
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <b>My Journey</b>
        {dropped && <span className="tag closed">Closed</span>}
      </div>
      <div className="pipeline">
        {journey.stages.map((s, i) => {
          const cls = !dropped && i < currentIdx ? 'done' : !dropped && i === currentIdx ? 'current' : '';
          return (
            <div key={s} className={`pip ${cls}`}>
              <span className="n">Step {i + 1}</span>{s}
            </div>
          );
        })}
      </div>
    </div>
  );
}
