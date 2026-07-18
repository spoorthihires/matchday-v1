import { useMemo, useState } from 'react';
import type { InstituteOwnershipRow } from './mockData.js';
import { TransferOwnerModal } from './TransferOwnerModal.js';

// UI-only mock tab: search + status filter + CSV export + table + a Transfer action that updates
// the in-memory row list (no backing API — see mockData.ts). Columns mirror the SPOC/ownership
// fields already on the real Institute model (owner/email), just reused across all institutes at
// once instead of one at a time (as InstitutesPage/TabOwnership.tsx do per-institute).

const STATUS_CLASS: Record<InstituteOwnershipRow['status'], string> = {
  Active: 'st-active',
  Pending: 'st-pending',
  Disabled: 'st-archived',
};

function csvEscape(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TabInstituteOwnership({
  rows, onChange,
}: { rows: InstituteOwnershipRow[]; onChange: (rows: InstituteOwnershipRow[]) => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [transferId, setTransferId] = useState<string | null>(null);

  const filtered = useMemo(() => rows.filter((r) => {
    const matchesQ = !q || r.institute.toLowerCase().includes(q.toLowerCase()) || r.owner.toLowerCase().includes(q.toLowerCase());
    const matchesStatus = !status || r.status === status;
    return matchesQ && matchesStatus;
  }), [rows, q, status]);

  function handleExport() {
    const head = ['Institute', 'City', 'Owner', 'Email', 'Candidates Owned', 'Last Transferred', 'Status'];
    const csv = [head.join(',')]
      .concat(filtered.map((r) => [r.institute, r.city, r.owner, r.email, r.candidatesOwned, r.lastTransferred, r.status].map(csvEscape).join(',')))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matchday-institute-ownership.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const transferTarget = rows.find((r) => r.id === transferId) ?? null;

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h3>Institute Ownership</h3>
          <div className="sub">SPOC assigned to each participating institute</div>
        </div>
      </div>

      <div className="dm-toolbar" style={{ padding: '0 18px' }}>
        <div className="dm-search">
          <i className="ti ti-search" />
          <input
            placeholder="Search institutes by name or owner…"
            aria-label="Search institutes"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Pending">Pending</option>
          <option value="Disabled">Disabled</option>
        </select>
        <div className="grow" />
        <button className="btn btn-ghost" onClick={handleExport}><i className="ti ti-download" /> Export</button>
      </div>

      <div className="dm-table-wrap" style={{ border: 0, boxShadow: 'none' }}>
        <div className="dm-scroll">
          <table className="dm" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Institute</th>
                <th>City</th>
                <th>Owner</th>
                <th className="r">Candidates Owned</th>
                <th>Last Transferred</th>
                <th>Status</th>
                <th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7}><div className="dm-empty">No institutes match these filters.</div></td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.institute}</b></td>
                  <td>{r.city}</td>
                  <td>
                    {r.owner}
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.email}</div>
                  </td>
                  <td className="r cap">{r.candidatesOwned}</td>
                  <td className="cap">{fmtDate(r.lastTransferred)}</td>
                  <td><span className={`badge-st ${STATUS_CLASS[r.status]}`}><i className="ti ti-circle-filled" /> {r.status}</span></td>
                  <td className="r">
                    <button className="btn btn-ghost" onClick={() => setTransferId(r.id)}>
                      <i className="ti ti-transfer" /> Transfer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {transferTarget && (
        <TransferOwnerModal
          title="Transfer Institute Ownership"
          entityLabel="Institute"
          entityName={transferTarget.institute}
          currentOwner={transferTarget.owner}
          onClose={() => setTransferId(null)}
          onTransfer={(newOwner) => {
            onChange(rows.map((r) => (r.id === transferTarget.id ? { ...r, owner: newOwner, lastTransferred: new Date().toISOString().slice(0, 10) } : r)));
            setTransferId(null);
          }}
        />
      )}
    </div>
  );
}
