import type { Funnel } from '../../../types/institutes.js';

// Ported from matchday-admin-app_23.html renderIdFunnel() (line ~3912): a `.card` wrapping the
// 7-step supply funnel (uploaded → signup → completion → match-ready → shortlist → offer →
// joined) as `.funnel`/`.fstep`/`.ftrack` bars, plus the upload→join `.conv` conversion footer.
// The detail payload only carries percentages per step (Funnel type), not the prototype's
// separate `counts()` helper output — so per-step counts are derived the same way the prototype
// derives them (`Math.round(uploaded * pct / 100)`).

export function TabFunnel({ funnel, instituteName }: { funnel: Funnel; instituteName: string }) {
  const steps: [string, number, number][] = [
    ['Candidates Uploaded', funnel.uploaded, 100],
    ['Signed Up', Math.round((funnel.uploaded * funnel.signupPct) / 100), funnel.signupPct],
    ['Profile Completed', Math.round((funnel.uploaded * funnel.completionPct) / 100), funnel.completionPct],
    ['Match-Ready', Math.round((funnel.uploaded * funnel.matchReadyPct) / 100), funnel.matchReadyPct],
    ['Shortlisted', Math.round((funnel.uploaded * funnel.shortlistPct) / 100), funnel.shortlistPct],
    ['Offers Sent', Math.round((funnel.uploaded * funnel.offerPct) / 100), funnel.offerPct],
    ['Joined', Math.round((funnel.uploaded * funnel.joinedPct) / 100), funnel.joinedPct],
  ];
  const joined = steps[steps.length - 1][1];
  const conv = funnel.uploaded ? ((joined / funnel.uploaded) * 100).toFixed(1) : '0';

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h3>Supply funnel</h3>
          <div className="sub">{instituteName} · this cycle</div>
        </div>
      </div>
      <div className="funnel">
        {steps.map(([name, value, p]) => (
          <div className="fstep" key={name}>
            <div className="fl">
              <span className="name">{name}</span>
              <span className="v mono">
                {value.toLocaleString('en-IN')} <span className="pct">{p}%</span>
              </span>
            </div>
            <div className="ftrack">
              <i style={{ width: `${Math.max(3, p)}%`, background: 'linear-gradient(90deg,#0aa3a3,#12bdbd)' }} />
            </div>
          </div>
        ))}
        <div className="conv">
          Upload → join conversion · <b className="mono">{conv}%</b>
        </div>
      </div>
    </div>
  );
}
