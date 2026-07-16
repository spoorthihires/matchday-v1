import { useState } from 'react';
import type { TemplateItem } from '../../types/templates.js';
import { secCounts, relativeUpdated } from './templateUtils.js';
import type { TemplateAction, TemplateListProps } from './TemplateCards.js';

function RowKebab({ t, onAction }: { t: TemplateItem; onAction: TemplateListProps['onAction'] }) {
  const [open, setOpen] = useState(false);
  const act = (a: TemplateAction) => { setOpen(false); onAction(a, t); };
  return (
    <div className="rowact" style={{ position: 'relative' }}>
      <button title="Edit" onClick={() => act('edit')}><i className="ti ti-edit" /></button>
      <button title="Clone" onClick={() => act('clone')}><i className="ti ti-copy" /></button>
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
  );
}

export function TemplateTable({ items, onAction }: TemplateListProps) {
  return (
    <div className="dm-table-wrap">
      <div className="dm-scroll">
        <table className="dm" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Template</th><th>Domain</th><th>Version</th><th className="c">Sections</th>
              <th className="r">Used by</th><th>Status</th><th>Updated</th><th className="r">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={8}><div className="dm-empty"><i className="ti ti-template-off" /> No templates match these filters.</div></td></tr>
            )}
            {items.map((t) => {
              const c = secCounts(t.sections);
              return (
                <tr key={t.id}>
                  <td><div className="dm-name"><b>{t.name}</b><span>{t.code}</span></div></td>
                  <td><span className="chip dom">{t.domain}</span></td>
                  <td><span className="vbadge">v{t.version}</span></td>
                  <td className="c">{c.assess} asmt · {c.stages} stages · {c.notif} notif</td>
                  <td className="r cap">{t.usedBy}</td>
                  <td><span className={`badge-st ${t.status === 'Active' ? 'st-active' : 'st-draft'}`}><i className="ti ti-circle-filled" /> {t.status}</span></td>
                  <td>{relativeUpdated(t.updatedAt)}</td>
                  <td className="r"><RowKebab t={t} onAction={onAction} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
