import { useEffect, useState } from 'react';

// Ported from matchday-admin-app_23.html lines 1346-1355 (.dm-toolbar/.dm-search/.select).
// The prototype's filters (#fStatus/#fMonth/#fStream/#fDomain) are hardcoded <option> lists
// against its in-memory mock drives; the status/stream/domain option sets below are transcribed
// verbatim from that markup (they double as the server's accepted status/stream/domain values).
// Month is generated (server expects `YYYY-MM`) rather than hardcoded to "Jul/Aug/Sep 2026" so the
// filter stays useful as the app moves through real months.

const STATUS_OPTIONS = ['Active', 'Published', 'Draft', 'Archived'];
const STREAM_OPTIONS = ['B.Tech', 'M.Tech', 'MCA', 'MBA'];
const DOMAIN_OPTIONS = ['Frontend', 'Backend', 'Full-stack', 'Data / ML', 'DevOps'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthOption { value: string; label: string; }

export function buildMonthOptions(count = 6, from: Date = new Date()): MonthOption[] {
  const options: MonthOption[] = [];
  const y0 = from.getFullYear();
  const m0 = from.getMonth();
  for (let i = 0; i < count; i++) {
    const d = new Date(y0, m0 + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    options.push({ value, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` });
  }
  return options;
}

export interface DrivesToolbarProps {
  q: string;
  status: string;
  month: string;
  stream: string;
  domain: string;
  onQChange: (q: string) => void;
  onStatusChange: (v: string) => void;
  onMonthChange: (v: string) => void;
  onStreamChange: (v: string) => void;
  onDomainChange: (v: string) => void;
  onExport: () => void;
  onCreate: () => void;
}

export function DrivesToolbar({
  q, status, month, stream, domain,
  onQChange, onStatusChange, onMonthChange, onStreamChange, onDomainChange,
  onExport, onCreate,
}: DrivesToolbarProps) {
  const [localQ, setLocalQ] = useState(q);
  const monthOptions = buildMonthOptions();

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
          placeholder="Search drives by name, domain, stream…"
          aria-label="Search drives"
          value={localQ}
          onChange={(e) => setLocalQ(e.target.value)}
        />
      </div>
      <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by status" value={status} onChange={(e) => onStatusChange(e.target.value)}>
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by month" value={month} onChange={(e) => onMonthChange(e.target.value)}>
        <option value="">All months</option>
        {monthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by stream" value={stream} onChange={(e) => onStreamChange(e.target.value)}>
        <option value="">All streams</option>
        {STREAM_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by domain" value={domain} onChange={(e) => onDomainChange(e.target.value)}>
        <option value="">All domains</option>
        {DOMAIN_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <div className="grow" />
      <button className="btn btn-ghost" onClick={onExport}><i className="ti ti-download" /> Export</button>
      <button className="btn btn-primary" onClick={onCreate}><i className="ti ti-plus" /> Create Drive</button>
    </div>
  );
}
