import { useState } from 'react';
import type { InstituteListItem } from '../../types/institutes.js';

// Ported from matchday-admin-app_23.html lines 1507-1584 (table.dm inside .dm-table-wrap/.dm-scroll)
// and the renderInstitutes()/stCls/pctCls row template around lines 3700-3725.
// This component renders only the `.dm-scroll > table.dm` portion — the outer `.dm-table-wrap`
// and the `.dm-pager` are owned by index.tsx (mirrors DrivesTable.tsx) so this table stays a pure,
// isolated-testable presentational component (see InstitutesTable.test.tsx).

export type InstituteSortKey = 'name' | 'type' | 'uploaded' | 'signup' | 'completion' | 'matchReady' | 'shortlist' | 'offer' | 'joined';
export type InstituteRowAction = 'view' | 'edit' | 'approve' | 'disable';

export interface InstitutesTableProps {
  items: InstituteListItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onSort: (key: InstituteSortKey) => void;
  sort: string | undefined;
  order: 'asc' | 'desc';
  onRowAction: (action: InstituteRowAction, id: string) => void;
  isLoading?: boolean;
}

// stCls from the prototype (line 3392/3710): Active→st-active, Pending→st-pending,
// Disabled→st-archived (verified against theme.css — there is no dedicated st-disabled class).
const STATUS_CLASS: Record<InstituteListItem['status'], string> = {
  Active: 'st-active',
  Pending: 'st-pending',
  Disabled: 'st-archived',
};

// Column order mirrors the prototype's <thead> exactly (lines 1524-1537).
interface Column { label: string; sortKey?: InstituteSortKey; className?: string; }
const COLUMNS: Column[] = [
  { label: 'Institute', sortKey: 'name' },
  { label: 'Type', sortKey: 'type' },
  { label: 'Uploaded', sortKey: 'uploaded', className: 'r' },
  { label: 'Signup', sortKey: 'signup', className: 'r' },
  { label: 'Completion', sortKey: 'completion', className: 'r' },
  { label: 'Match-Ready', sortKey: 'matchReady', className: 'r' },
  { label: 'Shortlist', sortKey: 'shortlist', className: 'r' },
  { label: 'Offer', sortKey: 'offer', className: 'r' },
  { label: 'Joined', sortKey: 'joined', className: 'r' },
  { label: 'Status' },
  { label: 'Actions', className: 'r' },
];

const COLSPAN = COLUMNS.length + 1; // +1 for the checkbox column

// iColors from the prototype (line 3677) — cycled by a stable hash of the (string) id since
// real ids are Mongo ObjectIds rather than the prototype's small integers.
const INST_COLORS = ['#2f4fe0', '#0aa3a3', '#7c5cff', '#f2a63b', '#d9314b', '#0f9d58'];

function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return INST_COLORS[h % INST_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// pctCls from the prototype (line 3690).
function pctClass(v: number): string {
  return v >= 75 ? 'pct-good' : v >= 50 ? 'pct-mid' : 'pct-low';
}

function sortIcon(active: boolean, order: 'asc' | 'desc'): string {
  if (!active) return 'ti-arrows-sort';
  return order === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending';
}

export function InstitutesTable({
  items, selectedIds, onToggle, onToggleAll, onSort, sort, order, onRowAction, isLoading,
}: InstitutesTableProps) {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.includes(i.id));
  // Local, presentation-only UI state (which row's overflow menu is open) — mirrors
  // DrivesTable's per-row openMenuId so this stays a pure component driven by explicit props.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const act = (action: InstituteRowAction, id: string) => { setOpenMenuId(null); onRowAction(action, id); };

  return (
    <div className="dm-scroll">
      <table className="dm" style={{ minWidth: 1200 }}>
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
                <div className="dm-empty">Loading institutes…</div>
              </td>
            </tr>
          )}
          {!isLoading && items.length === 0 && (
            <tr>
              <td colSpan={COLSPAN}>
                <div className="dm-empty">
                  <i className="ti ti-building-off" />
                  No institutes match these filters.
                  <br />
                  <span style={{ fontSize: 12.5 }}>Try clearing search or filters, or create a new institute.</span>
                </div>
              </td>
            </tr>
          )}
          {!isLoading && items.map((x) => {
            const selected = selectedIds.includes(x.id);
            return (
              <tr key={x.id} className={selected ? 'sel' : undefined}>
                <td className="c">
                  <span
                    className={`cb${selected ? ' on' : ''}`}
                    role="checkbox"
                    aria-checked={selected}
                    tabIndex={0}
                    onClick={() => onToggle(x.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(x.id); } }}
                  >
                    <i className="ti ti-check" />
                  </span>
                </td>
                <td>
                  <div className="inst-org">
                    <span className="ilogo" style={{ background: colorForId(x.id) }}>{initials(x.name)}</span>
                    <div>
                      <b
                        className="lnk"
                        role="button"
                        tabIndex={0}
                        onClick={() => act('view', x.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act('view', x.id); } }}
                      >
                        {x.name}
                      </b>
                      <span>{x.city} · {x.owner}</span>
                    </div>
                  </div>
                </td>
                <td>{x.type}</td>
                <td className="r cap">{x.uploaded.toLocaleString('en-IN')}</td>
                <td className="r"><span className={`pct ${pctClass(x.signupPct)}`}>{x.signupPct}%</span></td>
                <td className="r"><span className={`pct ${pctClass(x.completionPct)}`}>{x.completionPct}%</span></td>
                <td className="r">
                  <div className="mr-cell">
                    <span className="mini"><i style={{ width: `${x.matchReadyPct}%` }} /></span>
                    <span className={`pct ${pctClass(x.matchReadyPct)}`}>{x.matchReadyPct}%</span>
                  </div>
                </td>
                <td className="r"><span className={`pct ${pctClass(x.shortlistPct)}`}>{x.shortlistPct}%</span></td>
                <td className="r"><span className={`pct ${pctClass(x.offerPct)}`}>{x.offerPct}%</span></td>
                <td className="r"><span className={`pct ${pctClass(x.joinedPct)}`}>{x.joinedPct}%</span></td>
                <td><span className={`badge-st ${STATUS_CLASS[x.status]}`}><i className="ti ti-circle-filled" /> {x.status}</span></td>
                <td className="r" style={{ position: 'relative' }}>
                  <div className="rowact">
                    <button title="View" onClick={() => act('view', x.id)}><i className="ti ti-eye" /></button>
                    <button title="Edit" onClick={() => act('edit', x.id)}><i className="ti ti-edit" /></button>
                    <button title="More" onClick={() => setOpenMenuId(openMenuId === x.id ? null : x.id)}>
                      <i className="ti ti-dots-vertical" />
                    </button>
                  </div>
                  {openMenuId === x.id && (
                    <div className="kebab-menu show" style={{ top: '100%', right: 8 }}>
                      <button onClick={() => act('view', x.id)}><i className="ti ti-eye" /> View details</button>
                      <button onClick={() => act('edit', x.id)}><i className="ti ti-edit" /> Edit institute</button>
                      {x.status === 'Pending' && (
                        <button onClick={() => act('approve', x.id)}><i className="ti ti-circle-check" /> Approve institute</button>
                      )}
                      {x.status !== 'Disabled' && (
                        <>
                          <hr />
                          <button className="danger" onClick={() => act('disable', x.id)}><i className="ti ti-ban" /> Disable institute</button>
                        </>
                      )}
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
