import { useMemo, useState } from 'react';
import { useDrives } from '../Drives/hooks/useDrives.js';
import { useDriveAssignmentMutations } from './hooks/useDriveAssignmentMutations.js';

export function BulkAssignDrivesModal({ instituteIds, onClose }: { instituteIds: string[]; onClose: () => void }) {
  const { data: allDrives } = useDrives({ page: 1, limit: 100 });
  const { bulkAssign } = useDriveAssignmentMutations();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const drives = useMemo(() => (allDrives?.items ?? []).filter((d) => (d.name + ' ' + d.domain).toLowerCase().includes(q.trim().toLowerCase())), [allDrives, q]);

  function toggle(id: string) { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); }
  async function save() {
    if (sel.size) await bulkAssign.mutateAsync({ instituteIds, driveIds: [...sel] });
    onClose();
  }

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="baTitle" style={{ maxWidth: 560 }}>
        <div className="modal-h"><div><h3 id="baTitle">Assign Drives</h3><p>Assign to {instituteIds.length} selected institute{instituteIds.length === 1 ? '' : 's'}.</p></div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button></div>
        <div className="modal-b" style={{ gridTemplateColumns: '1fr' }}>
          <div className="dm-search"><i className="ti ti-search" /><input placeholder="Search drives…" aria-label="Search drives" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div style={{ maxHeight: '46vh', overflowY: 'auto', marginTop: 10 }}>
            {drives.map((d) => (
              <label key={d.id} className="asmt-row" style={{ cursor: 'pointer' }}>
                <div className="an"><b>{d.name}</b><span>{d.domain} · {d.stream} · {d.status}</span></div>
                <input type="checkbox" aria-label={d.name} checked={sel.has(d.id)} onChange={() => toggle(d.id)} />
              </label>
            ))}
            {drives.length === 0 && <div className="dm-empty" style={{ padding: 20 }}>No drives match.</div>}
          </div>
        </div>
        <div className="modal-f"><div className="grow" />
          <button className="btn btn-ghost btn-lg" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" type="button" onClick={save}><i className="ti ti-device-floppy" /> Assign to {instituteIds.length} institute{instituteIds.length === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}
