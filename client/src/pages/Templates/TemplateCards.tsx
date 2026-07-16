import { useState } from 'react';
import type { TemplateItem } from '../../types/templates.js';
import { secCounts, domainIcon, relativeUpdated } from './templateUtils.js';

export type TemplateAction = 'edit' | 'clone' | 'version' | 'toggle' | 'delete';

export interface TemplateListProps {
  items: TemplateItem[];
  onAction: (action: TemplateAction, t: TemplateItem) => void;
}

function Kebab({ t, onAction }: { t: TemplateItem; onAction: TemplateListProps['onAction'] }) {
  const [open, setOpen] = useState(false);
  const act = (a: TemplateAction) => { setOpen(false); onAction(a, t); };
  return (
    <>
      <button title="Edit" onClick={() => act('edit')}><i className="ti ti-edit" /></button>
      <button title="Clone" onClick={() => act('clone')}><i className="ti ti-copy" /></button>
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button title="More" onClick={() => setOpen((v) => !v)}><i className="ti ti-dots-vertical" /></button>
        {open && (
          <div className="kebab-menu show" style={{ top: '100%', right: 8 }}>
            <button onClick={() => act('edit')}><i className="ti ti-edit" /> Edit template</button>
            <button onClick={() => act('clone')}><i className="ti ti-copy" /> Clone template</button>
            <button onClick={() => act('version')}><i className="ti ti-history" /> Version history</button>
            <button onClick={() => act('toggle')}>
              <i className={`ti ti-${t.status === 'Active' ? 'circle-off' : 'circle-check'}`} />
              {' '}{t.status === 'Active' ? 'Deactivate' : 'Activate'}
            </button>
            <hr />
            <button className="danger" onClick={() => act('delete')}><i className="ti ti-trash" /> Delete template</button>
          </div>
        )}
      </div>
    </>
  );
}

export function TemplateCards({ items, onAction }: TemplateListProps) {
  if (items.length === 0) {
    return (
      <div className="tpl-grid">
        <div className="dm-empty" style={{ gridColumn: '1/-1' }}>
          <i className="ti ti-template-off" /> No templates match these filters.
        </div>
      </div>
    );
  }
  return (
    <div className="tpl-grid">
      {items.map((t) => {
        const c = secCounts(t.sections);
        const [ic, cl] = domainIcon(t.domain);
        return (
          <div key={t.id} className={`tpl-card${t.status === 'Inactive' ? ' inactive' : ''}`}>
            <div className="tpl-head">
              <span className={`tpl-ic ic ${cl}`}><i className={`ti ${ic}`} /></span>
              <div className="tt">
                <b>{t.name}</b>
                <div className="meta">
                  <span className="vbadge">v{t.version}</span>
                  <span className={`badge-st ${t.status === 'Active' ? 'st-active' : 'st-draft'}`}>
                    <i className="ti ti-circle-filled" /> {t.status}
                  </span>
                </div>
                <div className="tpl-updated">Updated {relativeUpdated(t.updatedAt)}</div>
              </div>
            </div>
            <div className="tpl-sections">
              <div className="tsec"><i className="ti ti-list-check" /> <b>{c.assess}</b> assessment</div>
              <div className="tsec"><i className="ti ti-scale" /> weightage set</div>
              <div className="tsec"><i className="ti ti-arrows-shuffle" /> <b>{c.match}</b> match rules</div>
              <div className="tsec"><i className="ti ti-layout-kanban" /> <b>{c.stages}</b> stages</div>
              <div className="tsec"><i className="ti ti-bell" /> <b>{c.notif}</b> notifications</div>
              <div className="tsec"><i className="ti ti-shield-lock" /> <b>{c.priv}</b> privacy rules</div>
            </div>
            <div className="tpl-foot">
              <span className="used">Used by <b>{t.usedBy}</b> drive{t.usedBy === 1 ? '' : 's'}</span>
              <div className="grow" />
              <Kebab t={t} onAction={onAction} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
