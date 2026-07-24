import { useState } from 'react';
import { useStreamMutations } from './hooks/useStreamMutations.js';
import { ALL_GRAD, ALL_BRANCHES, ALL_SOURCES, orderedFlow } from './streamsConstants.js';
import { ALL_FLOW, PARENTS, type StreamItem } from '../../types/streams.js';

export interface StreamEditorModalProps { mode: 'create' | 'edit'; stream?: StreamItem; onClose: () => void }

export function StreamEditorModal({ mode, stream, onClose }: StreamEditorModalProps) {
  const { create, update } = useStreamMutations();
  const [name, setName] = useState(stream?.name ?? '');
  const [parent, setParent] = useState(stream?.parent ?? 'Engineering');
  const [label, setLabel] = useState(stream?.label ?? '');
  const [skills, setSkills] = useState<string[]>(() => [...(stream?.skills ?? [])]);
  const [good, setGood] = useState<string[]>(() => [...(stream?.good ?? [])]);
  const [flow, setFlow] = useState<string[]>(() => [...(stream?.flow ?? [])]);   // create default [] (see plan note)
  const [cutoff, setCutoff] = useState(stream?.cutoff ?? 65);
  const [cgpa, setCgpa] = useState(stream?.cgpa ?? 6.5);
  const [backlogs, setBacklogs] = useState(stream?.backlogs ?? 1);
  const [grad, setGrad] = useState<string[]>(() => [...(stream?.grad ?? ['2025', '2026'])]);
  const [branches, setBranches] = useState<string[]>(() => [...(stream?.branches ?? ['CSE', 'IT'])]);
  const [sources, setSources] = useState<string[]>(() => [...(stream?.sources ?? ['Institutes'])]);
  const [status, setStatus] = useState(stream?.status ?? 'Active');
  const [skillIn, setSkillIn] = useState('');
  const [goodIn, setGoodIn] = useState('');
  const [nameError, setNameError] = useState(false);

  const addTag = (val: string, list: string[], set: (v: string[]) => void, clear: () => void) => {
    const v = val.trim();
    if (v && !list.includes(v)) set([...list, v]);
    clear();
  };
  const toggle = (v: string, list: string[], set: (x: string[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function save() {
    if (!name.trim()) { setNameError(true); return; }
    const body = {
      name: name.trim(), parent, label: label.trim(), skills, good, flow: orderedFlow(flow),
      cutoff, cgpa, backlogs, grad, branches, sources, status,
    };
    if (mode === 'edit' && stream) update.mutate({ id: stream.id, body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  }

  const chipGroup = (all: string[], sel: string[], set: (x: string[]) => void) => (
    <div className="schips">
      {all.map((v) => (
        <button key={v} type="button" aria-pressed={sel.includes(v)} className={`chipc${sel.includes(v) ? ' on' : ''}`} onClick={() => toggle(v, sel, set)}>
          <i className="ti ti-check" />{v}
        </button>
      ))}
    </div>
  );
  const tagBox = (list: string[], set: (x: string[]) => void, inVal: string, setIn: (s: string) => void, ph: string, gh = false) => (
    <div className="taginput">
      {list.map((t, i) => (
        <span className={`tag${gh ? ' gh' : ''}`} key={`${t}-${i}`}>{t} <i className="ti ti-x" role="button" aria-label={`Remove ${t}`} onClick={() => set(list.filter((_, idx) => idx !== i))} /></span>
      ))}
      <input placeholder={ph} value={inVal} onChange={(e) => setIn(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(inVal, list, set, () => setIn('')); } }} />
    </div>
  );

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="seTitle">
        <div className="modal-h">
          <div><h3 id="seTitle">{mode === 'edit' ? 'Edit Stream' : 'Create Stream'}</h3><p>Define a hiring stream and its evaluation settings.</p></div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div style={{ maxHeight: '64vh', overflowY: 'auto' }}>
          <div className="se-grid">
            <div className="fld"><label htmlFor="seName">Stream name</label>
              <input id="seName" placeholder="e.g. Frontend Engineering" value={name}
                style={nameError ? { borderColor: 'var(--danger)' } : undefined}
                onChange={(e) => { setName(e.target.value); if (nameError) setNameError(false); }} /></div>
            <div className="fld"><label htmlFor="seParent">Parent category</label>
              <select id="seParent" value={parent} onChange={(e) => setParent(e.target.value)}>{PARENTS.map((p) => <option key={p}>{p}</option>)}</select></div>
            <div className="fld full"><label htmlFor="seLabel">Employer-visible label</label>
              <input id="seLabel" placeholder="e.g. Frontend Developer" value={label} onChange={(e) => setLabel(e.target.value)} />
              <span className="fnote" style={{ fontSize: 11.5, color: 'var(--faint)' }}>Shown to employers on the drive listing.</span></div>
            <div className="fld full"><label>Skills required</label>{tagBox(skills, setSkills, skillIn, setSkillIn, 'Type a skill and press Enter…')}</div>
            <div className="fld full"><label>Good-to-have skills</label>{tagBox(good, setGood, goodIn, setGoodIn, 'Type a good-to-have skill and press Enter…', true)}</div>
            <div className="fld full"><label>Evaluation flow</label>
              <div className="flow-chips">
                {ALL_FLOW.map((f, i) => (
                  <span key={f}>
                    {i > 0 && <i className="ti ti-chevron-right arr" />}
                    <button type="button" aria-pressed={flow.includes(f)} className={`chipc${flow.includes(f) ? ' on' : ''}`} onClick={() => toggle(f, flow, setFlow)}><i className="ti ti-check" />{f}</button>
                  </span>
                ))}
              </div>
              <span className="fnote" style={{ fontSize: 11.5, color: 'var(--faint)' }}>Enabled stages run in this order.</span></div>
            <div className="fld full"><label>Cutoff score</label>
              <div className="cutoff-row"><input type="range" min={0} max={100} value={cutoff} aria-label="Cutoff score" onChange={(e) => setCutoff(Number(e.target.value))} /><span className="cv">{cutoff}%</span></div></div>
            <div className="fld"><label htmlFor="seCgpa">Eligibility · min CGPA</label>
              <input id="seCgpa" type="number" min={0} max={10} step={0.1} value={cgpa} onChange={(e) => setCgpa(e.target.value === '' ? 0 : Number(e.target.value))} /></div>
            <div className="fld"><label htmlFor="seBacklogs">Eligibility · max backlogs</label>
              <input id="seBacklogs" type="number" min={0} value={backlogs} onChange={(e) => setBacklogs(e.target.value === '' ? 0 : Number(e.target.value))} /></div>
            <div className="fld full"><label>Eligibility · graduation years</label>{chipGroup(ALL_GRAD, grad, setGrad)}</div>
            <div className="fld full"><label>Allowed branches</label>{chipGroup(ALL_BRANCHES, branches, setBranches)}</div>
            <div className="fld full"><label>Jobseeker sources</label>{chipGroup(ALL_SOURCES, sources, setSources)}</div>
            <div className="fld"><label htmlFor="seStatus">Status</label>
              <select id="seStatus" value={status} onChange={(e) => setStatus(e.target.value as 'Active' | 'Disabled')}><option>Active</option><option>Disabled</option></select></div>
          </div>
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" type="button" onClick={save}><i className="ti ti-device-floppy" /> Save stream</button>
        </div>
      </div>
    </div>
  );
}
