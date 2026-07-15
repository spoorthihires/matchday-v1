// Ported from matchday-admin-app_23.html lines 1655-1664 (.bulkbar/.bb). The prototype's
// Change Stream / Reset Eval / Merge bulk actions are deferred (no corresponding server bulk
// action beyond 'block' — see jobseekers.schemas.ts#bulkSchema) — only Block + Clear are wired.
// The parent only mounts <BulkBar> while selectedCount > 0 (mirrors Institutes/BulkBar.tsx), so
// this always renders with `.show` applied.

export interface BulkBarProps {
  selectedCount: number;
  onBlock: () => void;
  onClear: () => void;
}

export function BulkBar({ selectedCount, onBlock, onClear }: BulkBarProps) {
  if (selectedCount <= 0) return null;
  return (
    <div className="bulkbar show">
      <i className="ti ti-checkbox" /> <b>{selectedCount}</b> selected
      <div className="bb-actions">
        <button className="bb" onClick={onBlock}><i className="ti ti-ban" /> Block</button>
        <button className="bb clear" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}
