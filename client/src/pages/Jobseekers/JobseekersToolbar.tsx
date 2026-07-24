import { useEffect, useState } from 'react';
import { CONSENT_OPTIONS, EVAL_OPTIONS, MATCH_BUCKET_OPTIONS, OFFER_OPTIONS, STREAM_OPTIONS } from './constants.js';
import type { JobseekerView } from './ViewPills.js';

// Ported from matchday-admin-app_23.html lines 1646-1653 (.dm-toolbar/.dm-search + the hidden
// #jsViewFilter <select> that a view pill reveals). In the prototype #jsViewFilter is one shared
// element whose <option> list is repopulated by setJsView(); here it's the same select, but its
// option list is picked per `view` from the option sets already used elsewhere in this module
// (constants.ts) so the view pills and this filter can't drift out of sync.

export interface InstituteOption { id: string; name: string; }

export interface JobseekersToolbarProps {
  q: string;
  view: JobseekerView;
  viewFilterValue: string;
  instituteOptions: InstituteOption[];
  onQChange: (q: string) => void;
  onViewFilterChange: (v: string) => void;
  onUpload: () => void;
  onExport: () => void;
  onCreate: () => void;
}

function viewFilterOptions(view: JobseekerView, instituteOptions: InstituteOption[]): { value: string; label: string }[] {
  switch (view) {
    case 'institute':
      return instituteOptions.map((i) => ({ value: i.id, label: i.name }));
    case 'stream':
      return STREAM_OPTIONS.map((s) => ({ value: s, label: s }));
    case 'eval':
      return EVAL_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
    case 'match':
      return MATCH_BUCKET_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
    case 'offer':
      return OFFER_OPTIONS.map((o) => ({ value: o, label: o }));
    case 'consent':
      return CONSENT_OPTIONS.map((c) => ({ value: c, label: c }));
    case 'all':
    default:
      return [];
  }
}

export function JobseekersToolbar({
  q, view, viewFilterValue, instituteOptions, onQChange, onViewFilterChange, onUpload, onExport, onCreate,
}: JobseekersToolbarProps) {
  const [localQ, setLocalQ] = useState(q);

  // Debounce free-text search so every keystroke doesn't refetch the list.
  useEffect(() => setLocalQ(q), [q]);
  useEffect(() => {
    const t = setTimeout(() => { if (localQ !== q) onQChange(localQ); }, 300);
    return () => clearTimeout(t);
    // Intentionally depends on `localQ` only — re-running when `q` changes too would
    // re-arm the timer every time the parent echoes state back, defeating the debounce.
  }, [localQ]);

  const options = viewFilterOptions(view, instituteOptions);

  return (
    <div className="dm-toolbar">
      <div className="dm-search">
        <i className="ti ti-search" />
        <input
          placeholder="Search by name…"
          aria-label="Search jobseekers"
          value={localQ}
          onChange={(e) => setLocalQ(e.target.value)}
        />
      </div>
      {view !== 'all' && (
        <select
          className="select"
          style={{ appearance: 'auto' }}
          aria-label="View filter"
          value={viewFilterValue}
          onChange={(e) => onViewFilterChange(e.target.value)}
        >
          <option value="">All</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      <div className="grow" />
      <button className="btn btn-ghost" onClick={onUpload}><i className="ti ti-upload" /> Bulk Upload</button>
      <button className="btn btn-ghost" onClick={onExport}><i className="ti ti-download" /> Export</button>
      <button className="btn btn-accent" onClick={onCreate}><i className="ti ti-plus" /> Add Jobseeker</button>
    </div>
  );
}
