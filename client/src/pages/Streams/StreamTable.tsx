import { useState } from 'react';
import type { StreamItem } from '../../types/streams.js';

export type StreamAction = 'edit' | 'version' | 'toggle';
const COLS: { key: 'name' | 'parent' | 'cutoff'; label: string }[] = [
  { key: 'name', label: 'Stream' }, { key: 'parent', label: 'Parent Category' }, { key: 'cutoff', label: 'Cutoff' },
];

export interface StreamTableProps {
  items: StreamItem[];
  sort: string; order: string;
  onSort: (key: 'name' | 'parent' | 'cutoff') => void;
  onAction: (action: StreamAction, s: StreamItem) => void;
}

function RowKebab({ s, onAction }: { s: StreamItem; onAction: StreamTableProps['onAction'] }) {
  const [open, setOpen] = useState(false);
  const act = (a: StreamAction) => { setOpen(false); onAction(a, s); };
  return (
    <div className="rowact" style={{ position: 'relative' }}>
      <button title="Edit" onClick={() => act('edit')}><i className="ti ti-edit" /></button>
      <button title="Version history" onClick={() => act('version')}><i className="ti ti-history" /></button>
      <button title="More" onClick={() => setOpen((v) => !v)}><i className="ti ti-dots-vertical" /></button>
      {open && (
        <div className="kebab-menu show" style={{ top: '100%', right: 8 }}>
          <button onClick={() => act('edit')}><i className="ti ti-edit" /> Edit stream</button>
          <button onClick={() => act('version')}><i className="ti ti-history" /> Version history</button>
          <button onClick={() => act('toggle')}><i className={`ti ti-${s.status === 'Active' ? 'circle-off' : 'circle-check'}`} /> {s.status === 'Active' ? 'Disable' : 'Enable'} stream</button>
        </div>
      )}
    </div>
  );
}

function sortIcon(active: boolean, order: string): string {
  if (!active) return 'ti-arrows-sort';
  return order === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending';
}

export function StreamTable({ items, sort, order, onSort, onAction }: StreamTableProps) {
  return (
    <div className="dm-table-wrap">
      <div className="dm-scroll">
        <table className="dm" style={{ minWidth: 1080 }}>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={`sortable${sort === c.key ? ' sorted' : ''}`} onClick={() => onSort(c.key)} style={c.key === 'cutoff' ? { textAlign: 'right' } : undefined}>
                  {c.label} <i className={`ti ${sortIcon(sort === c.key, order)} sa`} />
                </th>
              ))}
              <th>Skills Required</th><th>Evaluation Flow</th><th>Branches</th><th>Employer Label</th><th>Version</th><th>Status</th><th className="r">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={10}><div className="dm-empty"><i className="ti ti-git-branch" /> No streams match these filters.</div></td></tr>}
            {items.map((s) => (
              <tr key={s.id}>
                <td><div className="dm-name"><b>{s.name}</b><span>{s.code}</span></div></td>
                <td><span className="chip stream">{s.parent}</span></td>
                <td className="r cap">{s.cutoff}%</td>
                <td>{s.skills.slice(0, 3).map((k) => <span className="skill-pill" key={k}>{k}</span>)}{s.skills.length > 3 && <span className="skill-pill">+{s.skills.length - 3}</span>}</td>
                <td>{s.flow.map((f, i) => <span key={f}>{i > 0 && <i className="ti ti-chevron-right" style={{ fontSize: 12, color: 'var(--faint)', verticalAlign: -1 }} />} {f}</span>)}</td>
                <td>{s.branches.join(', ')}</td>
                <td>{s.label}</td>
                <td><span className="vbadge">v{s.version}</span></td>
                <td><span className={`badge-st ${s.status === 'Active' ? 'st-active' : 'st-archived'}`}><i className="ti ti-circle-filled" /> {s.status}</span></td>
                <td className="r"><RowKebab s={s} onAction={onAction} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dm-pager"><div className="pinfo"><b>{items.length}</b> stream{items.length === 1 ? '' : 's'}</div></div>
    </div>
  );
}
