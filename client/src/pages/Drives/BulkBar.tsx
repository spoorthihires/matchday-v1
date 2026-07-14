// Ported from matchday-admin-app_23.html lines 1357-1365 (.bulkbar/.bb).
// The prototype toggles a `.show` class on a permanently-mounted bar; here the parent only
// mounts <BulkBar> while selectedCount > 0, so this always renders with `.show` applied.

export interface BulkBarProps {
  selectedCount: number;
  onPublish: () => void;
  onClone: () => void;
  onArchive: () => void;
  onClear: () => void;
}

export function BulkBar({ selectedCount, onPublish, onClone, onArchive, onClear }: BulkBarProps) {
  if (selectedCount <= 0) return null;
  return (
    <div className="bulkbar show">
      <i className="ti ti-checkbox" /> <b>{selectedCount}</b> selected
      <div className="bb-actions">
        <button className="bb" onClick={onPublish}><i className="ti ti-cloud-upload" /> Publish</button>
        <button className="bb" onClick={onClone}><i className="ti ti-copy" /> Clone</button>
        <button className="bb" onClick={onArchive}><i className="ti ti-archive" /> Archive</button>
        <button className="bb clear" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}
