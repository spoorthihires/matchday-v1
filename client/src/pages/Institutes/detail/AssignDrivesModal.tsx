import { useMemo, useState } from 'react';
import { useDrives } from '../../Drives/hooks/useDrives.js';
import { useInstituteDrives } from '../hooks/useInstituteDrives.js';
import { useDriveAssignmentMutations } from '../hooks/useDriveAssignmentMutations.js';

export function AssignDrivesModal({ instituteId, onClose }: { instituteId: string; onClose: () => void }) {
  const { data: allDrives } = useDrives({ page: 1, limit: 100 });
  const { data: current, isLoading: currentLoading } = useInstituteDrives(instituteId);
  const { assign, unassign } = useDriveAssignmentMutations(instituteId);
  const [q, setQ] = useState('');
  const [checked, setChecked] = useState<Set<string> | null>(null);

  // Gate all interaction until the current-assignments baseline has resolved. Without this, a
  // click before `current` loads (a real path from the header button, where the
  // ['institute-drives',id] cache is cold) would seed `checked` from an EMPTY baseline; when
  // `current` later resolves, `initial` would grow but `sel` wouldn't, so Save's diff would
  // compute a spurious `removed` and silently unassign a drive the user never touched.
  const baselineReady = current !== undefined && !currentLoading;
  const initial = useMemo(() => new Set((current?.items ?? []).map((d) => d.id)), [current]);
  const sel = checked ?? initial;   // start from current assignments once loaded
  const drives = (allDrives?.items ?? []).filter((d) => (d.name + ' ' + d.domain).toLowerCase().includes(q.trim().toLowerCase()));

  function toggle(id: string) {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setChecked(next);
  }
  async function save() {
    if (!baselineReady) return;   // never diff against an unloaded baseline
    const added = [...sel].filter((id) => !initial.has(id));
    const removed = [...initial].filter((id) => !sel.has(id));
    if (added.length) await assign.mutateAsync(added);
    await Promise.all(removed.map((id) => unassign.mutateAsync(id)));
    onClose();
  }

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="adTitle" style={{ maxWidth: 560 }}>
        <div className="modal-h"><div><h3 id="adTitle">Assign Drives</h3><p>Select the drives this institute participates in.</p></div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button></div>
        <div className="modal-b" style={{ gridTemplateColumns: '1fr' }}>
          {!baselineReady ? (
            <p style={{ padding: 20, color: 'var(--muted)' }}>Loading…</p>
          ) : (
            <>
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
            </>
          )}
        </div>
        <div className="modal-f"><div className="grow" />
          <button className="btn btn-ghost btn-lg" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" type="button" onClick={save} disabled={!baselineReady}><i className="ti ti-device-floppy" /> Save</button>
        </div>
      </div>
    </div>
  );
}
