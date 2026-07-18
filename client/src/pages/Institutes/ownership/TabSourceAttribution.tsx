import type { SourceAttributionRow } from './mockData.js';

// UI-only mock tab: a source-share donut (ported multi-segment via the same stroke-dasharray
// trick as ScheduleSection.tsx's slot-utilization donut) + a match-ready barchart (ported from
// matchday-admin-app_23.html's .barchart, see renderIdPerf() lines ~3919) + a detail table.
// CSV export mirrors the other ownership tabs.

const C = 339.3; // circumference of r=54, matches ScheduleSection.tsx's slot donut
const COLORS: Record<string, string> = {
  Campus: 'var(--indigo)',
  Referral: 'var(--teal)',
  Portal: 'var(--violet)',
  'Walk-in': 'var(--amber)',
};

const TREND_ICON: Record<SourceAttributionRow['trend'], string> = {
  up: 'ti-trending-up',
  down: 'ti-trending-down',
  flat: 'ti-minus',
};
const TREND_CLASS: Record<SourceAttributionRow['trend'], string> = {
  up: 'kd up',
  down: 'kd down',
  flat: 'kd flat',
};

function csvEscape(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

export function TabSourceAttribution({ rows }: { rows: SourceAttributionRow[] }) {
  let cumulative = 0;
  const segments = rows.map((r) => {
    const len = (r.sharePct / 100) * C;
    const seg = { row: r, len, offset: -cumulative };
    cumulative += len;
    return seg;
  });

  const maxMatchReady = Math.max(...rows.map((r) => r.matchReadyPct), 1);

  function handleExport() {
    const head = ['Source', 'Candidates', 'Share %', 'Match-Ready %', 'Trend'];
    const csv = [head.join(',')]
      .concat(rows.map((r) => [r.source, r.candidates, r.sharePct, r.matchReadyPct, r.trend].map(csvEscape).join(',')))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matchday-source-attribution.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <div className="card-h"><div><h3>Candidate Share by Source</h3><div className="sub">Where uploaded candidates originate</div></div></div>
          <div className="slot">
            <div className="donut">
              <svg width="130" height="130" viewBox="0 0 130 130">
                <circle cx="65" cy="65" r="54" fill="none" stroke="var(--indigo-050)" strokeWidth="14" />
                {segments.map((s) => (
                  <circle
                    key={s.row.id}
                    cx="65"
                    cy="65"
                    r="54"
                    fill="none"
                    stroke={COLORS[s.row.source] ?? 'var(--indigo)'}
                    strokeWidth="14"
                    strokeDasharray={`${s.len} ${C - s.len}`}
                    strokeDashoffset={s.offset}
                  />
                ))}
              </svg>
              <div className="center"><span className="n mono">{rows.reduce((n, r) => n + r.candidates, 0)}</span><span className="k">candidates</span></div>
            </div>
            <div className="slot-legend">
              {rows.map((r) => (
                <div className="lg" key={r.id}>
                  <span className="lgn"><span className="sw" style={{ background: COLORS[r.source] ?? 'var(--indigo)' }} /> {r.source}</span>
                  <span className="lgv">{r.sharePct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><div><h3>Match-Ready % by Source</h3><div className="sub">Quality of candidates per source</div></div></div>
          <div style={{ padding: '0 18px 6px' }}>
            <div className="barchart">
              {rows.map((r) => (
                <div className="bc" key={r.id}>
                  <div className="val mono">{r.matchReadyPct}%</div>
                  <div className="bwrap">
                    <div className="bar2" style={{ height: `${(r.matchReadyPct / maxMatchReady) * 100}%`, background: COLORS[r.source] }} />
                  </div>
                  <div className="lbl">{r.source}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <div><h3>Source Detail</h3><div className="sub">Full breakdown per source</div></div>
          <button className="btn btn-ghost" onClick={handleExport}><i className="ti ti-download" /> Export</button>
        </div>
        <div className="dm-table-wrap" style={{ border: 0, boxShadow: 'none' }}>
          <div className="dm-scroll">
            <table className="dm" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="r">Candidates</th>
                  <th className="r">Share</th>
                  <th className="r">Match-Ready</th>
                  <th className="r">Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><span className="chip dom">{r.source}</span></td>
                    <td className="r cap">{r.candidates.toLocaleString('en-IN')}</td>
                    <td className="r">{r.sharePct}%</td>
                    <td className="r">{r.matchReadyPct}%</td>
                    <td className="r"><span className={TREND_CLASS[r.trend]}><i className={`ti ${TREND_ICON[r.trend]}`} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
