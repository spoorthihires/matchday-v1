import { useState } from 'react';
import { useEvalConfigMutations } from './hooks/useEvalConfigMutations.js';
import { EVAL_TYPES, RETAKE_OPTIONS, type EvalConfigItem } from '../../types/evaluations.js';

export interface EvalConfigModalProps {
  mode: 'create' | 'edit';
  config?: EvalConfigItem;
  onClose: () => void;
}

export function EvalConfigModal({ mode, config, onClose }: EvalConfigModalProps) {
  const { create, update } = useEvalConfigMutations();
  const [name, setName] = useState(config?.name ?? '');
  const [type, setType] = useState(config?.type ?? 'MCQ');
  const [enabled, setEnabled] = useState(config?.enabled ?? true);
  const [passing, setPassing] = useState(config?.passing ?? 60);
  const [attempts, setAttempts] = useState(config?.attempts ?? 2);
  const [retake, setRetake] = useState(config?.retake ?? 'After cooldown');
  const [cooldown, setCooldown] = useState(config?.cooldown ?? 2);
  const [validity, setValidity] = useState(config?.validity ?? 90);
  const [autoQual, setAutoQual] = useState(config?.autoQual ?? false);
  const [threshold, setThreshold] = useState(config?.threshold ?? 70);
  const [nameError, setNameError] = useState(false);

  function save() {
    if (!name.trim()) { setNameError(true); return; }
    const body = { name: name.trim(), type, enabled, passing, attempts, retake, cooldown, validity, autoQual, threshold };
    if (mode === 'edit' && config) update.mutate({ id: config.id, body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  }
  const numOr = (v: string, d: number) => (v === '' ? d : Number(v));

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="emTitle">
        <div className="modal-h">
          <div><h3 id="emTitle">{mode === 'edit' ? 'Edit Configuration' : 'Create Configuration'}</h3><p>Rules applied when this assessment runs in a contest.</p></div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          <div className="fld full">
            <label htmlFor="emName">Configuration name</label>
            <input id="emName" placeholder="e.g. Standard MCQ round" value={name}
              style={nameError ? { borderColor: 'var(--danger)' } : undefined}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }} />
          </div>
          <div className="fld"><label htmlFor="emType">Assessment type</label>
            <select id="emType" value={type} onChange={(e) => setType(e.target.value)}>{EVAL_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div className="fld"><label htmlFor="emEnabled">Enabled</label>
            <button id="emEnabled" type="button" role="switch" aria-checked={enabled} aria-label="Enabled"
              className={`switch${enabled ? ' on' : ''}`} style={{ marginTop: 4 }} onClick={() => setEnabled((v) => !v)} />
          </div>
          <div className="fld"><label htmlFor="emPass">Passing score (%)</label>
            <input id="emPass" type="number" min={0} max={100} value={passing} onChange={(e) => setPassing(numOr(e.target.value, 0))} /></div>
          <div className="fld"><label htmlFor="emAttempts">Maximum attempts</label>
            <input id="emAttempts" type="number" min={1} max={10} value={attempts} onChange={(e) => setAttempts(numOr(e.target.value, 1))} /></div>
          <div className="fld"><label htmlFor="emRetake">Retake rules</label>
            <select id="emRetake" value={retake} onChange={(e) => setRetake(e.target.value)}>{RETAKE_OPTIONS.map((r) => <option key={r}>{r}</option>)}</select></div>
          <div className="fld"><label htmlFor="emCooldown">Cooldown period (days)</label>
            <input id="emCooldown" type="number" min={0} max={90} value={cooldown} onChange={(e) => setCooldown(numOr(e.target.value, 0))} /></div>
          <div className="fld"><label htmlFor="emValidity">Validity duration (days)</label>
            <input id="emValidity" type="number" min={1} max={365} value={validity} onChange={(e) => setValidity(numOr(e.target.value, 1))} /></div>
          <div className="fld"><label htmlFor="emAuto">Auto-qualification</label>
            <button id="emAuto" type="button" role="switch" aria-checked={autoQual} aria-label="Auto-qualification"
              className={`switch${autoQual ? ' on' : ''}`} style={{ marginTop: 4 }} onClick={() => setAutoQual((v) => !v)} /></div>
          {autoQual && (
            <div className="fld full">
              <label htmlFor="emThreshold">Auto-qualify when score ≥ (%)</label>
              <input id="emThreshold" type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(numOr(e.target.value, 0))} />
              <span className="fnote" style={{ fontSize: 11.5, color: 'var(--faint)' }}>Candidates above this score skip manual review.</span>
            </div>
          )}
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" type="button" onClick={save}><i className="ti ti-device-floppy" /> Save configuration</button>
        </div>
      </div>
    </div>
  );
}
