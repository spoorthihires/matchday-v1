import { useState } from 'react';
import { useInstituteDrives } from '../hooks/useInstituteDrives.js';
import { useDriveAssignmentMutations } from '../hooks/useDriveAssignmentMutations.js';
import { AssignDrivesModal } from './AssignDrivesModal.js';

const STATUS_CLASS: Record<string, string> = { Active: 'st-active', Published: 'st-published', Draft: 'st-draft', Archived: 'st-archived' };

export function TabDrives({ instituteId }: { instituteId: string }) {
  const { data, isLoading } = useInstituteDrives(instituteId);
  const { unassign } = useDriveAssignmentMutations(instituteId);
  const [assignOpen, setAssignOpen] = useState(false);
  const items = data?.items ?? [];

  return (
    <div className="card">
      <div className="card-h">
        <h3>Assigned Drives</h3>
        <div className="grow" />
        <button className="btn btn-ghost" onClick={() => setAssignOpen(true)}><i className="ti ti-calendar-plus" /> Assign Drives</button>
      </div>
      {isLoading && <p style={{ padding: '0 18px 20px', color: 'var(--muted)' }}>Loading…</p>}
      {!isLoading && items.length === 0 && (
        <div className="dm-empty" style={{ padding: 30 }}><i className="ti ti-calendar-off" /> No drives assigned yet.</div>
      )}
      {!isLoading && items.length > 0 && (
        <div className="dm-table-wrap"><div className="dm-scroll">
          <table className="dm" style={{ minWidth: 640 }}>
            <thead><tr><th>Drive</th><th>Domain</th><th>Stream</th><th>Month</th><th>Status</th><th className="r">Actions</th></tr></thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td><div className="dm-name"><b>{d.name}</b></div></td>
                  <td><span className="chip dom">{d.domain}</span></td>
                  <td><span className="chip stream">{d.stream}</span></td>
                  <td>{d.month}</td>
                  <td><span className={`badge-st ${STATUS_CLASS[d.status] ?? 'st-draft'}`}><i className="ti ti-circle-filled" /> {d.status}</span></td>
                  <td className="r"><div className="rowact"><button title="Unassign" aria-label={`Unassign ${d.name}`} onClick={() => unassign.mutate(d.id)}><i className="ti ti-x" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
      {assignOpen && <AssignDrivesModal instituteId={instituteId} onClose={() => setAssignOpen(false)} />}
    </div>
  );
}
