import { useEffect, useState } from 'react';
import { STATUS_OPTIONS, TYPE_OPTIONS } from './constants.js';

// Ported from matchday-admin-app_23.html lines 1517-1523 (.dm-toolbar/.dm-search/.select).

export interface InstitutesToolbarProps {
  q: string;
  type: string;
  status: string;
  onQChange: (q: string) => void;
  onTypeChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onExport: () => void;
  onCreate: () => void;
  onOwnership: () => void;
}

export function InstitutesToolbar({
  q, type, status, onQChange, onTypeChange, onStatusChange, onExport, onCreate, onOwnership,
}: InstitutesToolbarProps) {
  const [localQ, setLocalQ] = useState(q);

  // Debounce free-text search so every keystroke doesn't refetch the list.
  useEffect(() => setLocalQ(q), [q]);
  useEffect(() => {
    const t = setTimeout(() => { if (localQ !== q) onQChange(localQ); }, 300);
    return () => clearTimeout(t);
    // Intentionally depends on `localQ` only — re-running when `q` changes too would
    // re-arm the timer every time the parent echoes state back, defeating the debounce.
  }, [localQ]);

  return (
    <div className="dm-toolbar">
      <div className="dm-search">
        <i className="ti ti-search" />
        <input
          placeholder="Search institutes by name, type or city…"
          aria-label="Search institutes"
          value={localQ}
          onChange={(e) => setLocalQ(e.target.value)}
        />
      </div>
      <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by type" value={type} onChange={(e) => onTypeChange(e.target.value)}>
        <option value="">All types</option>
        {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by status" value={status} onChange={(e) => onStatusChange(e.target.value)}>
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <div className="grow" />
      <button className="btn btn-ghost" onClick={onOwnership}><i className="ti ti-users-group" /> Ownership</button>
      <button className="btn btn-ghost" onClick={onExport}><i className="ti ti-download" /> Export</button>
      <button className="btn btn-accent" onClick={onCreate}><i className="ti ti-plus" /> Create Institute</button>
    </div>
  );
}
