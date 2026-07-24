import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../../components/AppShell.js';
import { useEvalMonitor } from '../hooks/useEvalMonitor.js';
import type { MonitorCandidate } from '../../../types/evaluations.js';
import { STAGES, fmtMins, stageCounts, reachedCounts, monitorKpis } from './monitorUtils.js';

export function EvalMonitorPage() {
  const navigate = useNavigate();
  const [contest, setContest] = useState('');
  const [employer, setEmployer] = useState('');
  const [institute, setInstitute] = useState('');
  const [date, setDate] = useState('Last 30 days');
  const [selStage, setSelStage] = useState<number | null>(null);
  const [cands, setCands] = useState<MonitorCandidate[]>([]);
  const [updated, setUpdated] = useState('just now');

  const { data } = useEvalMonitor({ contest, employer, institute, date });

  // Re-sync local sim state whenever the server snapshot changes (filters/refetch).
  useEffect(() => { if (data) { setCands(data.candidates); setUpdated('just now'); } }, [data]);

  // Ephemeral live simulation — advance one random not-yet-Match-Ready candidate every ~3.5s.
  useEffect(() => {
    const t = setInterval(() => {
      setCands((prev) => {
        const movable = prev.filter((c) => c.stage < 9);
        if (!movable.length) return prev;
        const pick = movable[Math.floor(Math.random() * movable.length)];
        return prev.map((c) => c === pick
          ? { ...c, stage: c.stage + 1, minsAgo: 0, score: c.stage + 1 >= 2 && !c.score ? 55 + Math.floor(Math.random() * 44) : c.score }
          : { ...c, minsAgo: c.minsAgo + 1 });
      });
      setUpdated('just now');
    }, 3500);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => stageCounts(cands), [cands]);
  const reached = useMemo(() => reachedCounts(cands), [cands]);
  const kpi = useMemo(() => monitorKpis(cands), [cands]);
  const maxC = Math.max(1, ...counts);
  const rows = useMemo(() => {
    const list = selStage == null ? cands : cands.filter((c) => c.stage === selStage);
    return [...list].sort((a, b) => a.minsAgo - b.minsAgo);
  }, [cands, selStage]);

  const opts = data ?? { contests: [], employers: [], institutes: [] };

  function exportCsv() {
    const head = ['ID', 'Jobseeker', 'Institute', 'Contest', 'Employer', 'Stage', 'Score', 'Last update'];
    const body = rows.map((x) => [x.code, x.name, x.institute, x.contest, x.employer, STAGES[x.stage].k, x.score, fmtMins(x.minsAgo)].map((v) => `"${v}"`).join(','));
    const csv = [head.join(','), ...body].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'evaluation-monitoring.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <AppShell crumb="Supply · Evaluations" title="Evaluation Monitoring">
      <div className="content">
        <button className="backlink" onClick={() => navigate('/evaluations')}><i className="ti ti-arrow-left" /> Back to Evaluation Management</button>
        <div className="dm-toolbar">
          <select className="select" style={{ appearance: 'auto' }} aria-label="Contest" value={contest} onChange={(e) => setContest(e.target.value)}>
            <option value="">All contests</option>{opts.contests.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Employer" value={employer} onChange={(e) => setEmployer(e.target.value)}>
            <option value="">All employers</option>{opts.employers.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Institute" value={institute} onChange={(e) => setInstitute(e.target.value)}>
            <option value="">All institutes</option>{opts.institutes.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Date range" value={date} onChange={(e) => setDate(e.target.value)}>
            <option>Last 30 days</option><option>Last 7 days</option><option>Today</option><option>All time</option>
          </select>
          <div className="grow" />
          <span className="live-dot"><span className="d" /> Live · {updated}</span>
          <button className="btn btn-ghost" onClick={exportCsv}><i className="ti ti-download" /> Export</button>
        </div>

        <div className="kpis" style={{ marginBottom: 14 }}>
          <div className="kpi"><div className="kh"><span className="ic i-indigo"><i className="ti ti-users" /></span> In Pipeline</div><div className="kv mono">{kpi.total}</div><div className="kd flat"><i className="ti ti-minus" /> jobseekers</div></div>
          <div className="kpi"><div className="kh"><span className="ic i-amber"><i className="ti ti-hourglass" /></span> Awaiting Evaluation</div><div className="kv mono">{kpi.pending}</div><div className="kd flat"><i className="ti ti-alert-circle" /> in pending stages</div></div>
          <div className="kpi"><div className="kh"><span className="ic i-green"><i className="ti ti-user-check" /></span> Match Ready</div><div className="kv mono">{kpi.ready}</div><div className="kd up"><i className="ti ti-trending-up" /> {kpi.total ? Math.round(kpi.ready / kpi.total * 100) : 0}% of pipeline</div></div>
          <div className="kpi"><div className="kh"><span className="ic i-violet"><i className="ti ti-progress" /></span> Avg Progress</div><div className="kv mono">{kpi.avg}%</div><div className="kd up"><i className="ti ti-trending-up" /> through pipeline</div></div>
        </div>

        <div className="section-title">Stage-wise counts <span className="rule" /> <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--faint)' }}>click a stage to drill down</span></div>
        <div className="stage-strip">
          {STAGES.map((st, s) => (
            <div key={st.k} className={`stage-card${selStage === s ? ' on' : ''}`} onClick={() => setSelStage(selStage === s ? null : s)}>
              <div className="top" style={{ background: st.c }} /><div className="sc-n">{counts[s]}</div><div className="sc-l">{st.k}</div>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="card-h"><div><h3>Evaluation funnel</h3><div className="sub">Jobseekers reaching each stage</div></div></div>
            <div className="funnel">
              {STAGES.map((st, s) => (
                <div className="fstep" key={st.k}><div className="fl"><span className="name">{st.k}</span><span className="v mono">{reached[s]} <span className="pct">{kpi.total ? Math.round(reached[s] / kpi.total * 100) : 0}%</span></span></div>
                  <div className="ftrack"><i style={{ width: `${kpi.total ? Math.max(3, reached[s] / kpi.total * 100) : 0}%`, background: st.c }} /></div></div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-h"><div><h3>Pipeline health</h3><div className="sub">Where jobseekers are waiting</div></div></div>
            <div className="funnel">
              {STAGES.map((st, s) => (
                <div className="fstep" key={st.k}><div className="fl"><span className="name">{st.k}</span><span className="v mono">{counts[s]}</span></div>
                  <div className="ftrack"><i style={{ width: `${Math.max(3, counts[s] / maxC * 100)}%`, background: st.c }} /></div></div>
              ))}
            </div>
          </div>
        </div>

        <div className="section-title">Jobseekers · {selStage == null ? 'all stages' : STAGES[selStage].k} <span className="rule" />
          {selStage != null && <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--indigo)', cursor: 'pointer' }} onClick={() => setSelStage(null)}>Clear filter</span>}
        </div>
        <div className="dm-table-wrap">
          <div className="dm-scroll">
            <table className="dm" style={{ minWidth: 820 }}>
              <thead><tr><th>Jobseeker</th><th>Institute</th><th>Contest</th><th>Current stage</th><th className="r">Score</th><th className="r">Last update</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6}><div className="dm-empty"><i className="ti ti-user-off" /> No jobseekers in this view.</div></td></tr>}
                {rows.slice(0, 20).map((x) => (
                  <tr key={x.id}>
                    <td><div className="dm-name"><b>{x.name}</b><span>{x.code}</span></div></td>
                    <td>{x.institute}</td><td>{x.contest}</td>
                    <td><span className="stbadge" style={{ background: `${STAGES[x.stage].c}22`, color: STAGES[x.stage].c }}><i className="ti ti-circle-filled" /> {STAGES[x.stage].k}</span></td>
                    <td className="r cap">{x.score || '—'}</td>
                    <td className="r" style={{ color: 'var(--muted)' }}>{fmtMins(x.minsAgo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="dm-pager"><div className="pinfo">Showing <b>{Math.min(20, rows.length)}</b> of <b>{rows.length}</b>{selStage != null ? ` in ${STAGES[selStage].k}` : ''}</div></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
