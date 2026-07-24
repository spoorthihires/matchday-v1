import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../../components/AppShell.js';
import { useStreamRules } from '../hooks/useStreamRules.js';
import { useStreamRulesMutation } from '../hooks/useStreamRulesMutation.js';
import { useStreams } from '../hooks/useStreams.js';
import { SR_DEFAULTS, streamRulesSummary } from './streamRulesUtils.js';
import type { StreamRules } from '../../../types/streams.js';

const Switch = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`} onClick={onClick} />
);
const Pick = ({ opts, value, onPick }: { opts: string[]; value: string; onPick: (v: string) => void }) => (
  <div className="pick">{opts.map((o) => <button type="button" key={o} aria-pressed={value === o} aria-label={o} className={`opt${value === o ? ' on' : ''}`} onClick={() => onPick(o)}>{o}</button>)}</div>
);

export function StreamRulesPage() {
  const navigate = useNavigate();
  const { data } = useStreamRules();
  const { data: streamsData } = useStreams({ status: 'Active' });
  const save = useStreamRulesMutation();
  const [cfg, setCfg] = useState<StreamRules>(SR_DEFAULTS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { if (data) { setCfg(data); setDirty(false); } }, [data]);
  const set = <K extends keyof StreamRules>(k: K, v: StreamRules[K]) => { setCfg((c) => ({ ...c, [k]: v })); setDirty(true); };

  const primaryOpts = ['First selected stream', ...(streamsData?.items ?? []).map((s) => s.name)];

  function onSave() { save.mutate(cfg, { onSuccess: () => setDirty(false) }); }
  function onReset() {
    // eslint-disable-next-line no-alert
    if (window.confirm('Reset all stream selection rules to defaults?')) save.mutate(SR_DEFAULTS, { onSuccess: () => { setCfg(SR_DEFAULTS); setDirty(false); } });
  }

  return (
    <AppShell crumb="Configuration · Streams" title="Stream Selection Rules">
      <div className="content" style={{ maxWidth: 860 }}>
        <button className="backlink" onClick={() => navigate('/streams')}><i className="ti ti-arrow-left" /> Back to Streams</button>

        <div className="sr-summary"><b className="lab"><i className="ti ti-info-circle" /> Current policy</b><p>{streamRulesSummary(cfg)}</p></div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-indigo"><i className="ti ti-stack-2" /></span><div><b>Number of Streams Allowed</b><p>How many streams a jobseeker can be enrolled in.</p></div></div>
          <div className="set-body"><div className="set-row"><div className="sl"><b>Max streams per jobseeker</b><span>Includes primary and secondary streams.</span></div>
            <div className="sc"><Pick opts={['1', '2', '3', 'Unlimited']} value={cfg.numAllowed} onPick={(v) => set('numAllowed', v)} /></div></div></div>
        </div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-teal"><i className="ti ti-star" /></span><div><b>Primary Stream</b><p>Every jobseeker's main hiring track.</p></div></div>
          <div className="set-body">
            <div className="set-row"><div className="sl"><b>Require a primary stream</b><span>Jobseekers must designate one primary track.</span></div><div className="sc"><Switch on={cfg.requirePrimary} label="Require a primary stream" onClick={() => set('requirePrimary', !cfg.requirePrimary)} /></div></div>
            <div className={`set-row${cfg.requirePrimary ? '' : ' disabled'}`}><div className="sl"><b>Default primary stream</b><span>Applied when a jobseeker hasn't chosen one.</span></div><div className="sc"><select value={cfg.defaultPrimary} onChange={(e) => set('defaultPrimary', e.target.value)}>{primaryOpts.map((o) => <option key={o}>{o}</option>)}</select></div></div>
          </div>
        </div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-violet"><i className="ti ti-git-branch" /></span><div><b>Secondary Streams</b><p>Additional tracks a jobseeker may join.</p></div></div>
          <div className="set-body">
            <div className="set-row"><div className="sl"><b>Allow secondary streams</b><span>Let jobseekers opt into more than one track.</span></div><div className="sc"><Switch on={cfg.allowSecondary} label="Allow secondary streams" onClick={() => set('allowSecondary', !cfg.allowSecondary)} /></div></div>
            <div className={`set-row${cfg.allowSecondary ? '' : ' disabled'}`}><div className="sl"><b>Max secondary streams</b><span>Cap beyond the primary stream.</span></div><div className="sc"><input type="number" min={0} max={5} value={cfg.maxSecondary} onChange={(e) => set('maxSecondary', e.target.value === '' ? 0 : Number(e.target.value))} /></div></div>
          </div>
        </div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-amber"><i className="ti ti-switch-horizontal" /></span><div><b>Stream Change Policy</b><p>When and how jobseekers can switch streams.</p></div></div>
          <div className="set-body">
            <div className="set-row"><div className="sl"><b>Change window</b><span>Governs when switching is permitted.</span></div><div className="sc"><select value={cfg.changePolicy} onChange={(e) => set('changePolicy', e.target.value)}><option>Anytime</option><option>Before evaluation only</option><option>Requires admin approval</option><option>Locked after drive assignment</option></select></div></div>
            <div className="set-row"><div className="sl"><b>Cooldown between changes</b><span>Minimum days before switching again.</span></div><div className="sc"><input type="number" min={0} max={365} value={cfg.cooldown} onChange={(e) => set('cooldown', e.target.value === '' ? 0 : Number(e.target.value))} /> <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>days</span></div></div>
          </div>
        </div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-green"><i className="ti ti-recycle" /></span><div><b>Evaluation Reusability</b><p>Whether scores carry across streams.</p></div></div>
          <div className="set-body">
            <div className="set-row"><div className="sl"><b>Reuse evaluations across streams</b><span>Avoid re-testing jobseekers for shared skills.</span></div><div className="sc"><Switch on={cfg.reuseEval} label="Reuse evaluations across streams" onClick={() => set('reuseEval', !cfg.reuseEval)} /></div></div>
            <div className={`set-row${cfg.reuseEval ? '' : ' disabled'}`}><div className="sl"><b>Reuse scope</b><span>Which evaluations may be reused.</span></div><div className="sc"><Pick opts={['Any stream', 'Same domain only', 'Exact match only']} value={cfg.reuseScope} onPick={(v) => set('reuseScope', v)} /></div></div>
          </div>
        </div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-indigo"><i className="ti ti-clock-hour-4" /></span><div><b>Evaluation Validity</b><p>How long evaluation results stay valid.</p></div></div>
          <div className="set-body">
            <div className="set-row"><div className="sl"><b>Evaluations expire</b><span>Require re-evaluation after a period.</span></div><div className="sc"><Switch on={cfg.validityExpires} label="Evaluations expire" onClick={() => set('validityExpires', !cfg.validityExpires)} /></div></div>
            <div className={`set-row${cfg.validityExpires ? '' : ' disabled'}`}><div className="sl"><b>Validity period</b><span>Days a completed evaluation remains valid.</span></div><div className="sc"><input type="number" min={1} max={720} value={cfg.validityDays} onChange={(e) => set('validityDays', e.target.value === '' ? 1 : Number(e.target.value))} /> <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>days</span></div></div>
          </div>
        </div>

        <div className="set-card">
          <div className="sc-h"><span className="sic i-violet"><i className="ti ti-wand" /></span><div><b>Auto Stream Suggestion</b><p>Recommend streams from jobseeker profiles.</p></div></div>
          <div className="set-body">
            <div className="set-row"><div className="sl"><b>Suggest streams automatically</b><span>Surface best-fit streams during signup.</span></div><div className="sc"><Switch on={cfg.autoSuggest} label="Suggest streams automatically" onClick={() => set('autoSuggest', !cfg.autoSuggest)} /></div></div>
            <div className={`set-row${cfg.autoSuggest ? '' : ' disabled'}`}><div className="sl"><b>Suggestion basis</b><span>Signals used to rank streams.</span></div><div className="sc"><Pick opts={['Skills', 'Past evaluations', 'Skills + evaluations']} value={cfg.suggestBasis} onPick={(v) => set('suggestBasis', v)} /></div></div>
            <div className={`set-row${cfg.autoSuggest ? '' : ' disabled'}`}><div className="sl"><b>Confidence threshold</b><span>Minimum match to show a suggestion.</span></div><div className="sc"><input type="range" min={0} max={100} value={cfg.confidence} aria-label="Confidence threshold" onChange={(e) => set('confidence', Number(e.target.value))} /> <span className="rv">{cfg.confidence}%</span></div></div>
          </div>
        </div>

        <div className="sr-foot">
          <span className={`sr-dirty${dirty ? ' show' : ''}`}><i className="ti ti-point-filled" /> Unsaved changes</span>
          <div className="grow" style={{ flex: 1 }} />
          <button className="btn btn-ghost" type="button" onClick={onReset}><i className="ti ti-rotate" /> Reset to defaults</button>
          <button className="btn btn-primary" type="button" onClick={onSave}><i className="ti ti-device-floppy" /> Save rules</button>
        </div>
      </div>
    </AppShell>
  );
}
