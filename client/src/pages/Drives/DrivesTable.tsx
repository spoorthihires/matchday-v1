import { useState } from 'react';
import type { DriveListItem } from '../../types/drives.js';

// Ported from matchday-admin-app_23.html lines 1367-1389 (table.dm inside .dm-table-wrap/.dm-scroll)
// and the renderDrives()/stClass row template around lines 2460-2487.
// This component renders only the `.dm-scroll > table.dm` portion — the outer `.dm-table-wrap`
// and the `.dm-pager` (a sibling of `.dm-scroll` in the prototype) are owned by index.tsx so
// this table stays a pure, isolated-testable presentational component (see DrivesTable.test.tsx).

export type DriveSortKey = 'name' | 'domain' | 'stream' | 'month' | 'candCap' | 'empCap' | 'slotCap' | 'status';
export type DriveRowAction = 'edit' | 'clone' | 'publish' | 'archive';

export interface DrivesTableProps {
  items: DriveListItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onSort: (key: DriveSortKey) => void;
  sort: string | undefined;
  order: 'asc' | 'desc';
  onRowAction: (action: DriveRowAction, id: string) => void;
  isLoading?: boolean;
}

const STATUS_CLASS: Record<DriveListItem['status'], string> = {
  Active: 'st-active',
  Published: 'st-published',
  Draft: 'st-draft',
  Archived: 'st-archived',
};

// Column order mirrors the prototype's <thead> exactly (lines 1373-1384): sortable and
// plain columns are interleaved, not grouped.
interface Column { label: string; sortKey?: DriveSortKey; className?: string; }
const COLUMNS: Column[] = [
  { label: 'Drive Name', sortKey: 'name' },
  { label: 'Domain', sortKey: 'domain' },
  { label: 'Stream', sortKey: 'stream' },
  { label: 'Month', sortKey: 'month' },
  { label: 'Frequency' },
  { label: 'Event Day' },
  { label: 'Cand. Cap', sortKey: 'candCap', className: 'r' },
  { label: 'Emp. Cap', sortKey: 'empCap', className: 'r' },
  { label: 'Slot Cap', sortKey: 'slotCap', className: 'r' },
  { label: 'Status', sortKey: 'status' },
  { label: 'Created By' },
  { label: 'Actions', className: 'r' },
];

const COLSPAN = COLUMNS.length + 1; // +1 for the checkbox column

function num(n: number): string {
  return n.toLocaleString('en-IN');
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function sortIcon(active: boolean, order: 'asc' | 'desc'): string {
  if (!active) return 'ti-arrows-sort';
  return order === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending';
}

export function DrivesTable({
  items, selectedIds, onToggle, onToggleAll, onSort, sort, order, onRowAction, isLoading,
}: DrivesTableProps) {
  const allSelected = items.length > 0 && items.every((d) => selectedIds.includes(d.id));
  // Local, presentation-only UI state (which row's overflow menu is open) — ported from the
  // prototype's shared #kebab singleton (lines 2560-2581), but scoped per-row here so this
  // stays a pure component driven by explicit props for DrivesTable.test.tsx.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const act = (action: DriveRowAction, id: string) => { setOpenMenuId(null); onRowAction(action, id); };

  return (
    <div className="dm-scroll">
      <table className="dm">
        <thead>
          <tr>
            <th className="c" style={{ width: 42 }}>
              <span
                className={`cb${allSelected ? ' on' : ''}`}
                role="checkbox"
                aria-label="Select all"
                aria-checked={allSelected}
                tabIndex={0}
                onClick={onToggleAll}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleAll(); } }}
              >
                <i className="ti ti-check" />
              </span>
            </th>
            {COLUMNS.map((col) => {
              if (!col.sortKey) {
                return <th key={col.label} className={col.className}>{col.label}</th>;
              }
              const active = sort === col.sortKey;
              return (
                <th
                  key={col.label}
                  className={`sortable${col.className ? ` ${col.className}` : ''}${active ? ' sorted' : ''}`}
                  onClick={() => onSort(col.sortKey!)}
                >
                  {col.label} <i className={`ti ${sortIcon(active, order)} sa`} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={COLSPAN}>
                <div className="dm-empty">Loading drives…</div>
              </td>
            </tr>
          )}
          {!isLoading && items.length === 0 && (
            <tr>
              <td colSpan={COLSPAN}>
                <div className="dm-empty">
                  <i className="ti ti-calendar-off" />
                  No drives match these filters.
                  <br />
                  <span style={{ fontSize: 12.5 }}>Try clearing search or filters, or create a new drive.</span>
                </div>
              </td>
            </tr>
          )}
          {!isLoading && items.map((d) => {
            const selected = selectedIds.includes(d.id);
            return (
              <tr key={d.id} className={selected ? 'sel' : undefined}>
                <td className="c">
                  <span
                    className={`cb${selected ? ' on' : ''}`}
                    role="checkbox"
                    aria-checked={selected}
                    tabIndex={0}
                    onClick={() => onToggle(d.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(d.id); } }}
                  >
                    <i className="ti ti-check" />
                  </span>
                </td>
                <td>
                  <div className="dm-name">
                    <b>{d.name}</b>
                    <span>ID · MD-{d.id.slice(-6).toUpperCase()}</span>
                  </div>
                </td>
                <td><span className="chip dom">{d.domain}</span></td>
                <td><span className="chip stream">{d.stream}</span></td>
                <td>{d.month}</td>
                <td>{d.frequency}</td>
                <td><i className="ti ti-calendar" style={{ color: 'var(--indigo)', verticalAlign: -2, fontSize: 15 }} /> {d.eventDay}</td>
                <td className="r cap">{num(d.candCap)}</td>
                <td className="r cap">{num(d.empCap)}</td>
                <td className="r cap">{num(d.slotCap)}</td>
                <td><span className={`badge-st ${STATUS_CLASS[d.status]}`}><i className="ti ti-circle-filled" /> {d.status}</span></td>
                <td><div className="creator"><span className="av">{initials(d.createdBy)}</span> {d.createdBy}</div></td>
                <td className="r" style={{ position: 'relative' }}>
                  <div className="rowact">
                    <button title="Edit" onClick={() => act('edit', d.id)}><i className="ti ti-edit" /></button>
                    <button title="Clone" onClick={() => act('clone', d.id)}><i className="ti ti-copy" /></button>
                    <button
                      title="More"
                      onClick={() => setOpenMenuId(openMenuId === d.id ? null : d.id)}
                    >
                      <i className="ti ti-dots-vertical" />
                    </button>
                  </div>
                  {openMenuId === d.id && (
                    <div className="kebab-menu show" style={{ top: '100%', right: 8 }}>
                      <button onClick={() => act('edit', d.id)}><i className="ti ti-edit" /> Edit drive</button>
                      <button onClick={() => act('clone', d.id)}><i className="ti ti-copy" /> Clone drive</button>
                      <button onClick={() => act('publish', d.id)}><i className="ti ti-cloud-upload" /> Publish drive</button>
                      <hr />
                      <button className="danger" onClick={() => act('archive', d.id)}><i className="ti ti-archive" /> Archive drive</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
