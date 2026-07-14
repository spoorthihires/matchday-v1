import type { DashboardOverview, FunnelStep } from '../../types/dashboard.js';

// Ported from matchday-admin-app_23.html lines ~1229-1262.

// Decorative only — fixed per-funnel-type accent gradient matching the
// prototype's hardcoded gradients (not DTO data; there are only three,
// known, fixed funnel identities).
const ACCENTS: Record<'supply' | 'demand' | 'hiring', string> = {
  supply: 'linear-gradient(90deg,#0aa3a3,#12bdbd)',
  demand: 'linear-gradient(90deg,#2f4fe0,#5a74ee)',
  hiring: 'linear-gradient(90deg,#7c5cff,#9d84ff)',
};

function Funnel({
  title, sub, steps, accent,
}: { title: string; sub: string; steps: FunnelStep[]; accent: string }) {
  const max = steps[0]?.value || 1;
  const last = steps[steps.length - 1];
  const prev = steps[steps.length - 2];
  return (
    <div className="card">
      <div className="card-h"><div><h3>{title}</h3><div className="sub">{sub}</div></div></div>
      <div className="funnel">
        {steps.map((s) => (
          <div className="fstep" key={s.name}>
            <div className="fl">
              <span className="name">{s.name}</span>
              <span className="v mono">
                {s.value.toLocaleString('en-US')}
                {s.pct != null && <span className="pct"> {s.pct}%</span>}
              </span>
            </div>
            <div className="ftrack">
              <i style={{ width: `${Math.round((s.value / max) * 100)}%`, background: accent }} />
            </div>
          </div>
        ))}
        {/* The DTO has no explicit end-to-end conversion field, and the
            prototype's own per-funnel formula isn't consistent (full-funnel
            for Supply, mid-funnel for Demand, last-hop for Hiring) — so
            rather than guess a formula, this reuses the final step's own
            server-computed `pct` (already a ratio vs. its previous step). */}
        {last && prev && last.pct != null && (
          <div className="conv">
            {prev.name} → {last.name} · <b className="mono">{last.pct}%</b>
          </div>
        )}
      </div>
    </div>
  );
}

export function FunnelsSection({ funnels }: { funnels: DashboardOverview['funnels'] }) {
  return (
    <>
      <div className="section-title">Conversion funnels <span className="rule" /></div>
      <div className="grid-3">
        <Funnel title="Supply Funnel" sub="Jobseeker → match-ready" steps={funnels.supply} accent={ACCENTS.supply} />
        <Funnel title="Demand Funnel" sub="Employer → booked slots" steps={funnels.demand} accent={ACCENTS.demand} />
        <Funnel title="Hiring Funnel" sub="Match-ready → joined" steps={funnels.hiring} accent={ACCENTS.hiring} />
      </div>
    </>
  );
}
