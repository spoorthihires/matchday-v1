// Ported from matchday-admin-app_23.html lines 1905-1913 (.bulkbar/.bb).
// The prototype's "Assign Drives" bulk action needs the employer↔drive link, which is out of
// scope for this task (same deferral as Institutes) — it is ported as a real, always-visible
// button but left disabled with a "coming soon" title rather than wired to a stub handler.
// The parent only mounts <BulkBar> while selectedCount > 0 (mirrors Institutes/BulkBar.tsx), so
// this always renders with `.show` applied.

export interface BulkBarProps {
  selectedCount: number;
  onApprove: () => void;
  onDisable: () => void;
  onClear: () => void;
}

export function BulkBar({ selectedCount, onApprove, onDisable, onClear }: BulkBarProps) {
  if (selectedCount <= 0) return null;
  return (
    <div className="bulkbar show">
      <i className="ti ti-checkbox" /> <b>{selectedCount}</b> selected
      <div className="bb-actions">
        <button className="bb" onClick={onApprove}><i className="ti ti-circle-check" /> Approve</button>
        <button className="bb" disabled title="Assign Drives — coming soon"><i className="ti ti-calendar-plus" /> Assign Drives</button>
        <button className="bb" onClick={onDisable}><i className="ti ti-ban" /> Disable</button>
        <button className="bb clear" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}
