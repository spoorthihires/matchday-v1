import { useState } from 'react';
import { useTemplateMutations } from './hooks/useTemplateMutations.js';
import { baseSections } from './templateUtils.js';
import { NOTIF_CHANNELS, TEMPLATE_DOMAINS, type TemplateItem, type TemplateSections, type TemplateStatus } from '../../types/templates.js';

type Tab = 'assessment' | 'weightage' | 'matching' | 'kanban' | 'notifications' | 'privacy';
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'assessment', icon: 'ti-list-check', label: 'Assessment' },
  { id: 'weightage', icon: 'ti-scale', label: 'Scoring' },
  { id: 'matching', icon: 'ti-arrows-shuffle', label: 'Matching' },
  { id: 'kanban', icon: 'ti-layout-kanban', label: 'Kanban' },
  { id: 'notifications', icon: 'ti-bell', label: 'Notifications' },
  { id: 'privacy', icon: 'ti-shield-lock', label: 'Privacy' },
];
const CH_ICON: Record<string, string> = { Email: 'mail', WhatsApp: 'brand-whatsapp', Bell: 'bell' };
const ASSESS_ROWS: [keyof TemplateSections['assessment'], string, string][] = [
  ['mcq', 'MCQ round', 'Aptitude & fundamentals'],
  ['coding', 'Coding round', 'Programming problems'],
  ['tara', 'TARA AI interview', 'AI prescreening with Copilot score'],
  ['assignments', 'Assignments', 'Take-home task'],
];

export interface TemplateEditorModalProps {
  mode: 'create' | 'edit';
  template?: TemplateItem;
  onClose: () => void;
}

export function TemplateEditorModal({ mode, template, onClose }: TemplateEditorModalProps) {
  const { create, update } = useTemplateMutations();
  const [name, setName] = useState(template?.name ?? '');
  const [domain, setDomain] = useState<string>(template?.domain ?? 'Data / Analytics');
  const [status, setStatus] = useState<TemplateStatus>(template?.status ?? 'Active');
  const [tab, setTab] = useState<Tab>('assessment');
  const [draft, setDraft] = useState<TemplateSections>(() => structuredClone(template ? template.sections : baseSections()));
  const [nameError, setNameError] = useState(false);
  const [stageIn, setStageIn] = useState('');

  const wtTotal = Object.values(draft.weightage).reduce((a, b) => a + b, 0);

  function save() {
    if (!name.trim()) { setNameError(true); return; }
    const body = { name: name.trim(), domain, status, sections: draft };
    if (mode === 'edit' && template) {
      update.mutate({ id: template.id, body }, { onSuccess: onClose });
    } else {
      create.mutate(body, { onSuccess: onClose });
    }
  }

  function addStage() {
    const v = stageIn.trim();
    if (!v) return;
    setDraft((d) => ({ ...d, kanban: [...d.kanban, v] }));
    setStageIn('');
  }

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="tplTitle">
        <div className="modal-h">
          <div>
            <h3 id="tplTitle">{mode === 'edit' ? 'Edit Template' : 'Create Template'}</h3>
            <p>Reusable configuration applied when spinning up a drive.</p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        <div className="ed-head-fields">
          <div className="fld">
            <label htmlFor="teName">Template name</label>
            <input
              id="teName" placeholder="e.g. Data Analyst" value={name}
              style={nameError ? { borderColor: 'var(--danger)' } : undefined}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }}
            />
            {nameError && <span style={{ color: 'var(--danger)', fontSize: 12 }}>Template name is required.</span>}
          </div>
          <div className="fld">
            <label htmlFor="teDomain">Domain</label>
            <select id="teDomain" value={domain} onChange={(e) => setDomain(e.target.value)}>
              {TEMPLATE_DOMAINS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="teStatus">Status</label>
            <select id="teStatus" value={status} onChange={(e) => setStatus(e.target.value as TemplateStatus)}>
              <option>Active</option><option>Inactive</option>
            </select>
          </div>
        </div>

        <div className="ed-body">
          <div className="ed-tabs">
            {TABS.map((t) => (
              <button
                key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                className={`ed-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}
              >
                <i className={`ti ${t.icon}`} /> {t.label}
              </button>
            ))}
          </div>

          <div className="ed-pane">
            {tab === 'assessment' && (
              <>
                <h4>Assessment structure</h4>
                <p className="phelp">Toggle the screening stages this template includes.</p>
                {ASSESS_ROWS.map(([k, n, d]) => (
                  <div className="asmt-row" key={k}>
                    <div className="an"><b>{n}</b><span>{d}</span></div>
                    <button
                      type="button" role="switch" aria-checked={draft.assessment[k]} aria-label={n}
                      className={`switch${draft.assessment[k] ? ' on' : ''}`}
                      onClick={() => setDraft((s) => ({ ...s, assessment: { ...s.assessment, [k]: !s.assessment[k] } }))}
                    />
                  </div>
                ))}
              </>
            )}

            {tab === 'weightage' && (
              <>
                <h4>Scoring weightage</h4>
                <p className="phelp">Distribute 100% across the scored stages.</p>
                {Object.keys(draft.weightage).map((k) => (
                  <div className="wt-row" key={k}>
                    <span className="wt-name">{k}</span>
                    <input
                      type="range" min={0} max={100} value={draft.weightage[k]} aria-label={k}
                      onChange={(e) => setDraft((s) => ({ ...s, weightage: { ...s.weightage, [k]: Number(e.target.value) } }))}
                    />
                    <span className="wt-val">{draft.weightage[k]}%</span>
                  </div>
                ))}
                <div className="wt-total"><span>Total</span><b className={wtTotal === 100 ? 'good' : 'bad'}>{wtTotal}%</b></div>
              </>
            )}

            {tab === 'matching' && (
              <>
                <h4>Matching rules</h4>
                <p className="phelp">Weight each criterion, then set the minimum match score to qualify.</p>
                {Object.keys(draft.matching).filter((k) => k !== 'threshold').map((k) => (
                  <div className="match-row" key={k}>
                    <span className="mn">{k}</span>
                    <input
                      type="range" min={0} max={100} value={draft.matching[k]} aria-label={k}
                      onChange={(e) => setDraft((s) => ({ ...s, matching: { ...s.matching, [k]: Number(e.target.value) } }))}
                    />
                    <span className="mv">{draft.matching[k]}%</span>
                  </div>
                ))}
                <div className="wt-total"><span>Match threshold</span><b>{draft.matching.threshold}%</b></div>
                <div className="match-row" style={{ marginTop: 8 }}>
                  <span className="mn">Threshold</span>
                  <input
                    type="range" min={0} max={100} value={draft.matching.threshold} aria-label="Threshold"
                    onChange={(e) => setDraft((s) => ({ ...s, matching: { ...s.matching, threshold: Number(e.target.value) } }))}
                  />
                  <span className="mv">{draft.matching.threshold}%</span>
                </div>
              </>
            )}

            {tab === 'kanban' && (
              <>
                <h4>Kanban stages</h4>
                <p className="phelp">The pipeline candidates move through. Add or remove stages.</p>
                <div className="stage-list">
                  {draft.kanban.map((st, i) => (
                    <div className="stage-item" key={`${st}-${i}`}>
                      <span className="num">{i + 1}</span>
                      <span className="sn">{st}</span>
                      <i
                        className="ti ti-x rm" role="button" aria-label={`Remove ${st}`}
                        onClick={() => setDraft((s) => ({ ...s, kanban: s.kanban.filter((_, idx) => idx !== i) }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="stage-add">
                  <input
                    placeholder="Add a stage…" value={stageIn} aria-label="Add a stage"
                    onChange={(e) => setStageIn(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStage(); } }}
                  />
                  <button className="btn btn-ghost" type="button" onClick={addStage}><i className="ti ti-plus" /> Add</button>
                </div>
              </>
            )}

            {tab === 'notifications' && (
              <>
                <h4>Notification templates</h4>
                <p className="phelp">Choose which channels fire for each event.</p>
                {draft.notifications.map((n, i) => (
                  <div className="notif-row" key={n.name}>
                    <span className="nn">{n.name}</span>
                    <div className="chn">
                      {NOTIF_CHANNELS.map((ch) => {
                        const on = n.ch.includes(ch);
                        return (
                          <button
                            key={ch} type="button" aria-pressed={on} aria-label={`${n.name} ${ch}`}
                            className={`cw${on ? ' on' : ''}`}
                            onClick={() => setDraft((s) => {
                              const notifications = s.notifications.map((row, idx) =>
                                idx === i
                                  ? { ...row, ch: row.ch.includes(ch) ? row.ch.filter((c) => c !== ch) : [...row.ch, ch] }
                                  : row);
                              return { ...s, notifications };
                            })}
                          >
                            <i className={`ti ti-${CH_ICON[ch]}`} />{ch}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}

            {tab === 'privacy' && (
              <>
                <h4>Privacy rules</h4>
                <p className="phelp">Data-handling defaults applied to candidates in this template.</p>
                {Object.keys(draft.privacy).map((k) => (
                  <div className="priv-row" key={k}>
                    <div className="pn"><b>{k}</b></div>
                    <button
                      type="button" role="switch" aria-checked={draft.privacy[k]} aria-label={k}
                      className={`switch${draft.privacy[k] ? ' on' : ''}`}
                      onClick={() => setDraft((s) => ({ ...s, privacy: { ...s.privacy, [k]: !s.privacy[k] } }))}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" type="button" onClick={save}>
            <i className="ti ti-device-floppy" /> Save template
          </button>
        </div>
      </div>
    </div>
  );
}
