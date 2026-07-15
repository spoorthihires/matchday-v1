import { useEffect, useState } from 'react';
import { INDUSTRY_OPTIONS, STATUS_OPTIONS } from './constants.js';

// Ported from matchday-admin-app_23.html lines 1895-1903 (.dm-toolbar/.dm-search/.select).

export interface EmployersToolbarProps {
  q: string;
  industry: string;
  status: string;
  onQChange: (q: string) => void;
  onIndustryChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onApprovals: () => void;
  onExport: () => void;
  onCreate: () => void;
}

export function EmployersToolbar({
  q, industry, status, onQChange, onIndustryChange, onStatusChange, onApprovals, onExport, onCreate,
}: EmployersToolbarProps) {
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
          placeholder="Search employers by name or industry…"
          aria-label="Search employers"
          value={localQ}
          onChange={(e) => setLocalQ(e.target.value)}
        />
      </div>
      <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by industry" value={industry} onChange={(e) => onIndustryChange(e.target.value)}>
        <option value="">All industries</option>
        {INDUSTRY_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
      <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by status" value={status} onChange={(e) => onStatusChange(e.target.value)}>
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <div className="grow" />
      <button className="btn btn-ghost" onClick={onApprovals}><i className="ti ti-file-check" /> Registration Approvals</button>
      <button className="btn btn-ghost" onClick={onExport}><i className="ti ti-download" /> Export</button>
      <button className="btn btn-primary" onClick={onCreate}><i className="ti ti-plus" /> Create Employer</button>
    </div>
  );
}
