import { useState } from 'react';
import type { EvalConfigItem } from '../../types/evaluations.js';

export type EvalConfigAction = 'edit' | 'duplicate' | 'toggle' | 'delete';
const TYPE_META: Record<string, [string, string]> = {
  MCQ: ['ti-list-check', 'i-indigo'], Coding: ['ti-code', 'i-teal'],
  TARA: ['ti-robot', 'i-violet'], Assignments: ['ti-file-text', 'i-amber'],
};

export interface EvalConfigCardsProps {
  items: EvalConfigItem[];
  onAction: (action: EvalConfigAction, c: EvalConfigItem) => void;
  onToggle: (c: EvalConfigItem) => void;
}

function Kebab({ c, onAction }: { c: EvalConfigItem; onAction: EvalConfigCardsProps['onAction'] }) {
  const [open, setOpen] = useState(false);
  const act = (a: EvalConfigAction) => { setOpen(false); onAction(a, c); };
  return (
    <>
      <button title="Edit" onClick={() => act('edit')}><i className="ti ti-edit" /></button>
      <button title="Duplicate" onClick={() => act('duplicate')}><i className="ti ti-copy" /></button>
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button title="More" onClick={() => setOpen((v) => !v)}><i className="ti ti-dots-vertical" /></button>
        {open && (
          <div className="kebab-menu show" style={{ top: '100%', right: 8 }}>
            <button onClick={() => act('edit')}><i className="ti ti-edit" /> Edit configuration</button>
            <button onClick={() => act('duplicate')}><i className="ti ti-copy" /> Duplicate</button>
            <button onClick={() => act('toggle')}>
              <i className={`ti ti-${c.enabled ? 'circle-off' : 'circle-check'}`} /> {c.enabled ? 'Disable' : 'Enable'}
            </button>
            <hr />
            <button className="danger" onClick={() => act('delete')}><i className="ti ti-trash" /> Delete</button>
          </div>
        )}
      </div>
    </>
  );
}

export function EvalConfigCards({ items, onAction, onToggle }: EvalConfigCardsProps) {
  if (items.length === 0) {
    return <div className="tpl-grid"><div className="dm-empty" style={{ gridColumn: '1/-1' }}><i className="ti ti-clipboard-off" /> No configurations match these filters.</div></div>;
  }
  return (
    <div className="tpl-grid">
      {items.map((c) => {
        const [ic, cl] = TYPE_META[c.type] ?? ['ti-clipboard-check', 'i-indigo'];
        return (
          <div key={c.id} className={`tpl-card${c.enabled ? '' : ' ev-off'}`}>
            <div className="tpl-head">
              <span className={`tpl-ic ic ${cl}`}><i className={`ti ${ic}`} /></span>
              <div className="tt">
                <b>{c.name}</b>
                <div className="meta">
                  <span className="chip dom">{c.type}</span>
                  <span className={`badge-st ${c.enabled ? 'st-active' : 'st-draft'}`}><i className="ti ti-circle-filled" /> {c.enabled ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
              <button
                type="button" title="Enable / disable" aria-pressed={c.enabled}
                className={`switch ev-toggle${c.enabled ? ' on' : ''}`} onClick={() => onToggle(c)}
              />
            </div>
            <div className="tpl-sections">
              <div className="tsec"><i className="ti ti-target" /> Passing <span className="tsv">{c.passing}%</span></div>
              <div className="tsec"><i className="ti ti-repeat" /> Attempts <span className="tsv">{c.attempts}</span></div>
              <div className="tsec wide"><i className="ti ti-refresh" /> Retake <span className="tsv">{c.retake}</span></div>
              <div className="tsec"><i className="ti ti-hourglass" /> Cooldown <span className="tsv">{c.cooldown}d</span></div>
              <div className="tsec"><i className="ti ti-clock-hour-4" /> Validity <span className="tsv">{c.validity}d</span></div>
              <div className="tsec wide"><i className="ti ti-wand" /> Auto-qualify <span className="tsv">{c.autoQual ? `≥ ${c.threshold}%` : 'Manual'}</span></div>
            </div>
            <div className="tpl-foot">
              <span className="used">Assigned to <b>{c.contests}</b> contest{c.contests === 1 ? '' : 's'}</span>
              <div className="grow" />
              <Kebab c={c} onAction={onAction} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
