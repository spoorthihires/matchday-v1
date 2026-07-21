import { useState } from 'react';
import { useEmployerReports } from './hooks/useEmployerReports.js';
import type { ReportFunnelStage } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }
const GREEN_STAGES = new Set(['Offered', 'Accepted', 'Joined']);
const KPI_DEFS: { key: string; label: string; suffix?: string; warn?: (v: number) => boolean }[] = [
  { key: 'recommended', label: 'Candidates recommended' },
  { key: 'shortlisted', label: 'Candidates shortlisted' },
  { key: 'interviewsScheduled', label: 'Interviews scheduled' },
  { key: 'offersSent', label: 'Offers sent' },
  { key: 'offersAccepted', label: 'Offers accepted' },
  { key: 'dropOffPct', label: 'Drop-off rate', suffix: '%', warn: (v) => v >= 50 },
  { key: 'avgMatchScore', label: 'Avg match score', suffix: '/100' },
];

export function EmployerReports() {
  const [driveId, setDriveId] = useState('all');
  const report = useEmployerReports(driveId);
  const data = report.data;

  const exportCsv = () => {
    if (!data) return;
    const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [
      `MatchDay Report — ${driveId === 'all' ? 'All drives' : (data.drives.find((d) => d.id === driveId)?.name ?? driveId)}`,
      'Metric,Value',
      ...KPI_DEFS.map((k) => `${esc(k.label)},${(data.kpis as Record<string, number>)[k.key]}${k.suffix ?? ''}`),
      '',
      'Funnel stage,Count,% of prev',
      ...data.funnel.map((f) => `${esc(f.stage)},${f.count},${f.conversionPct}%`),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `matchday-report-${driveId}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const maxCount = data ? Math.max(1, data.funnel[0]?.count ?? 1) : 1;

  return (
    <div className="page-wrap">
      <div className="card"><h2>Reports &amp; analytics</h2><p className="hint">Post-MatchDay funnel and conversion across your drives.</p></div>

      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <select className="select" aria-label="Drive" value={driveId} onChange={(e) => setDriveId(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="all">All drives</option>
          {(data?.drives ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button type="button" className="btn btn-ghost" disabled={!data} onClick={exportCsv}>Export report</button>
      </div>

      {report.isLoading ? <p className="hint">Loading…</p>
        : report.isError ? <p className="hint">{errMsg(report.error)}</p>
        : !data ? null
        : (
          <>
            <div className="kpi-grid" style={{ marginBottom: 18 }}>
              {KPI_DEFS.map((k) => {
                const v = (data.kpis as Record<string, number>)[k.key];
                return (
                  <div className="kpi" key={k.key}>
                    <div className="klabel">{k.label}</div>
                    <div className="kn" style={k.warn?.(v) ? { color: 'var(--amber)' } : undefined}>{v}{k.suffix ?? ''}</div>
                  </div>
                );
              })}
            </div>

            <div className="card">
              <div className="card-head"><h3>Hiring funnel</h3></div>
              <div className="card-body">
                <div className="rep-funnel">
                  {data.funnel.map((f: ReportFunnelStage, i: number) => (
                    <div className="rf-row" key={f.stage}>
                      <div className="rf-l">{f.stage}</div>
                      <div className="rf-track"><i className={GREEN_STAGES.has(f.stage) ? 'green' : ''} style={{ width: `${Math.max(3, (f.count / maxCount) * 100)}%` }} /></div>
                      <div className="rf-right"><div className="rf-v">{f.count}</div><div className="rf-conv">{i > 0 ? `${f.conversionPct}% of prev` : ' '}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
    </div>
  );
}
