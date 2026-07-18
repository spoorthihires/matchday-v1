import { useMemo, useState } from 'react';
import type { CandidateOwnershipRow } from './mockData.js';
import { OWNER_POOL } from './mockData.js';
import { TransferOwnerModal } from './TransferOwnerModal.js';

// UI-only mock tab: search + owner/status filters + CSV export + table + a Transfer action that
// updates the in-memory row list (no backing API — see mockData.ts).

const STATUS_CLASS: Record<CandidateOwnershipRow['status'], string> = {
  Active: 'st-active',
  Pending: 'st-pending',
  Unassigned: 'st-archived',
};

function csvEscape(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TabCandidateOwnership({
  rows, onChange,
}: { rows: CandidateOwnershipRow[]; onChange: (rows: CandidateOwnershipRow[]) => void }) {
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState('');
  const [transferId, setTransferId] = useState<string | null>(null);

  const filtered = useMemo(() => rows.filter((r) => {
    const matchesQ = !q || r.candidate.toLowerCase().includes(q.toLowerCase()) || r.institute.toLowerCase().includes(q.toLowerCase());
    const matchesOwner = !owner || r.owner === owner;
    const matchesStatus = !status || r.status === status;
    return matchesQ && matchesOwner && matchesStatus;
  }), [rows, q, owner, status]);

  function handleExport() {
    const head = ['Candidate', 'Email', 'Institute', 'Source', 'Owner', 'Role', 'Assigned On', 'Status'];
    const csv = [head.join(',')]
      .concat(filtered.map((r) => [r.candidate, r.email, r.institute, r.source, r.owner, r.ownerRole, r.assignedOn, r.status].map(csvEscape).join(',')))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matchday-candidate-ownership.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const transferTarget = rows.find((r) => r.id === transferId) ?? null;

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h3>Candidate Ownership</h3>
          <div className="sub">Every uploaded candidate and their assigned owner</div>
        </div>
      </div>

      <div className="dm-toolbar" style={{ padding: '0 18px' }}>
        <div className="dm-search">
          <i className="ti ti-search" />
          <input
            placeholder="Search candidates by name or institute…"
            aria-label="Search candidates"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">All owners</option>
          {OWNER_POOL.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Pending">Pending</option>
          <option value="Unassigned">Unassigned</option>
        </select>
        <div className="grow" />
        <button className="btn btn-ghost" onClick={handleExport}><i className="ti ti-download" /> Export</button>
      </div>

      <div className="dm-table-wrap" style={{ border: 0, boxShadow: 'none' }}>
        <div className="dm-scroll">
          <table className="dm" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Institute</th>
                <th>Source</th>
                <th>Owner</th>
                <th>Role</th>
                <th>Assigned On</th>
                <th>Status</th>
                <th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8}><div className="dm-empty">No candidates match these filters.</div></td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.candidate}</b>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.email}</div>
                  </td>
                  <td>{r.institute}</td>
                  <td><span className="chip dom">{r.source}</span></td>
                  <td>{r.owner}</td>
                  <td>{r.ownerRole}</td>
                  <td className="cap">{fmtDate(r.assignedOn)}</td>
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
          title="Transfer Candidate Ownership"
          entityLabel="Candidate"
          entityName={transferTarget.candidate}
          currentOwner={transferTarget.owner}
          onClose={() => setTransferId(null)}
          onTransfer={(newOwner) => {
            onChange(rows.map((r) => (r.id === transferTarget.id ? { ...r, owner: newOwner, ownerRole: 'Recruiter', status: 'Active' } : r)));
            setTransferId(null);
          }}
        />
      )}
    </div>
  );
}
