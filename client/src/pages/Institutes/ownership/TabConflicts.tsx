import { useMemo, useState } from 'react';
import type { ConflictRow } from './mockData.js';
import { ResolveConflictModal } from './ResolveConflictModal.js';

// UI-only mock tab: search + severity/status filters + CSV export + table + a Resolve action
// that updates the in-memory row list (no backing API — see mockData.ts).

const SEVERITY_CLASS: Record<ConflictRow['severity'], string> = {
  High: 'st-danger',
  Medium: 'st-pending',
  Low: 'st-teal',
};
const STATUS_CLASS: Record<ConflictRow['status'], string> = {
  Open: 'st-danger',
  Resolved: 'st-active',
};

function csvEscape(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TabConflicts({
  rows, onChange,
}: { rows: ConflictRow[]; onChange: (rows: ConflictRow[]) => void }) {
  const [q, setQ] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [resolveId, setResolveId] = useState<string | null>(null);

  const filtered = useMemo(() => rows.filter((r) => {
    const matchesQ = !q || r.entity.toLowerCase().includes(q.toLowerCase());
    const matchesSeverity = !severity || r.severity === severity;
    const matchesStatus = !status || r.status === status;
    return matchesQ && matchesSeverity && matchesStatus;
  }), [rows, q, severity, status]);

  function handleExport() {
    const head = ['Type', 'Entity', 'Claimant A', 'Claimant B', 'Detected On', 'Severity', 'Status', 'Resolved Owner'];
    const csv = [head.join(',')]
      .concat(filtered.map((r) => [r.type, r.entity, r.claimantA, r.claimantB, r.detectedOn, r.severity, r.status, r.resolvedOwner ?? ''].map(csvEscape).join(',')))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matchday-ownership-conflicts.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const resolveTarget = rows.find((r) => r.id === resolveId) ?? null;
  const openCount = rows.filter((r) => r.status === 'Open').length;

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h3>Ownership Conflicts</h3>
          <div className="sub">{openCount} open conflict{openCount === 1 ? '' : 's'} need review</div>
        </div>
      </div>

      <div className="dm-toolbar" style={{ padding: '0 20px' }}>
        <div className="dm-search">
          <i className="ti ti-search" />
          <input
            placeholder="Search conflicts by candidate or institute…"
            aria-label="Search conflicts"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All severities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Open">Open</option>
          <option value="Resolved">Resolved</option>
        </select>
        <div className="grow" />
        <button className="btn btn-ghost" onClick={handleExport}><i className="ti ti-download" /> Export</button>
      </div>

      <div className="dm-table-wrap" style={{ border: 0, boxShadow: 'none' }}>
        <div className="dm-scroll">
          <table className="dm" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Entity</th>
                <th>Claimants</th>
                <th>Detected On</th>
                <th>Severity</th>
                <th>Status</th>
                <th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7}><div className="dm-empty">No conflicts match these filters.</div></td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td><span className="chip stream">{r.type}</span></td>
                  <td><b>{r.entity}</b></td>
                  <td>
                    {r.status === 'Resolved' ? (
                      <span>{r.resolvedOwner} <span style={{ color: 'var(--muted)' }}>(kept)</span></span>
                    ) : (
                      <span>{r.claimantA} <span style={{ color: 'var(--muted)' }}>vs</span> {r.claimantB}</span>
                    )}
                  </td>
                  <td className="cap">{fmtDate(r.detectedOn)}</td>
                  <td><span className={`badge-st ${SEVERITY_CLASS[r.severity]}`}><i className="ti ti-circle-filled" /> {r.severity}</span></td>
                  <td><span className={`badge-st ${STATUS_CLASS[r.status]}`}><i className="ti ti-circle-filled" /> {r.status}</span></td>
                  <td className="r">
                    {r.status === 'Open' && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => setResolveId(r.id)}
                      >
                        <i className="ti ti-circle-check" /> Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {resolveTarget && (
        <ResolveConflictModal
          conflict={resolveTarget}
          onClose={() => setResolveId(null)}
          onResolve={(winningOwner) => {
            onChange(rows.map((r) => (r.id === resolveTarget.id ? { ...r, status: 'Resolved', resolvedOwner: winningOwner } : r)));
            setResolveId(null);
          }}
        />
      )}
    </div>
  );
}
