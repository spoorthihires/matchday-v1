import type { InstituteDetailResponse } from '../../../types/institutes.js';

// Bound to `performance` from GET /api/institutes/:id (institutes.service.ts#getInstitute):
// this institute's match-ready/joined rates vs. the platform average (avgMatchReadyPct, computed
// server-side over Active institutes) plus its rank among them.
//
// The prototype's renderIdPerf() (lines ~3927-3936) instead charts synthetic per-drive history
// ("Drive 1".."Drive 4", seeded random `rnd()` values) — there is no per-drive breakdown in this
// build's API, so rather than fabricate a bar chart from data we don't have, this renders the
// payload's real comparison fields as `.kpi` cards (the same vocabulary as the header KPI row and
// the Institutes list Overview row).

type Performance = InstituteDetailResponse['performance'];

export function TabPerformance({ performance }: { performance: Performance }) {
  const aheadOfAvg = performance.matchReadyPct >= performance.avgMatchReadyPct;

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h3>Performance vs platform average</h3>
          <div className="sub">Match-ready &amp; join rate for this institute</div>
        </div>
      </div>
      <div className="kpis" style={{ padding: '0 18px 18px' }}>
        <div className="kpi">
          <div className="kh"><span className="ic i-indigo"><i className="ti ti-user-check" /></span> Match-Ready Rate</div>
          <div className="kv mono">{performance.matchReadyPct}%</div>
          <div className={`kd ${aheadOfAvg ? 'up' : 'down'}`}>
            <i className={`ti ti-arrow-${aheadOfAvg ? 'up' : 'down'}`} /> vs {performance.avgMatchReadyPct}% avg
          </div>
        </div>
        <div className="kpi">
          <div className="kh"><span className="ic i-green"><i className="ti ti-confetti" /></span> Join Rate</div>
          <div className="kv mono">{performance.joinedPct}%</div>
          <div className="kd flat"><i className="ti ti-minus" /></div>
        </div>
        <div className="kpi">
          <div className="kh"><span className="ic i-violet"><i className="ti ti-trophy" /></span> Platform Rank</div>
          <div className="kv mono">{performance.rank != null ? `#${performance.rank}` : '—'}</div>
          <div className="kd flat"><i className="ti ti-minus" /> of {performance.ofActive} active</div>
        </div>
      </div>
    </div>
  );
}
