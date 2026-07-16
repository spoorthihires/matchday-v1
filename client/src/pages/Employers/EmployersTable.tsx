import { useState } from 'react';
import type { EmployerListItem } from '../../types/employers.js';

// Ported from matchday-admin-app_23.html lines 1917-1931 (table.dm inside .dm-table-wrap/.dm-scroll)
// and the renderEmployers()/stCls/pctCls/fmtResp row template around lines 3389-3409.
// This component renders only the `.dm-scroll > table.dm` portion — the outer `.dm-table-wrap`
// and the `.dm-pager` are owned by index.tsx (mirrors InstitutesTable.tsx) so this table stays a
// pure, isolated-testable presentational component (see EmployersTable.test.tsx).

export type EmployerSortKey = 'name' | 'industry' | 'drives' | 'viewed' | 'shortlist' | 'offer' | 'respHours';
export type EmployerRowAction = 'edit' | 'approve' | 'disable' | 'view-drives';

export interface EmployersTableProps {
  items: EmployerListItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onSort: (key: EmployerSortKey) => void;
  sort: string | undefined;
  order: 'asc' | 'desc';
  onRowAction: (action: EmployerRowAction, id: string) => void;
  isLoading?: boolean;
}

// stCls from the prototype (line 3392): Active→st-active, Pending→st-pending,
// Disabled→st-archived (same map as InstitutesTable — verified against theme.css, there is no
// dedicated st-disabled class).
const STATUS_CLASS: Record<EmployerListItem['status'], string> = {
  Active: 'st-active',
  Pending: 'st-pending',
  Disabled: 'st-archived',
};

// Column order mirrors the prototype's <thead> exactly (lines 1918-1929).
interface Column { label: string; sortKey?: EmployerSortKey; className?: string; }
const COLUMNS: Column[] = [
  { label: 'Employer', sortKey: 'name' },
  { label: 'Industry', sortKey: 'industry' },
  { label: 'Active Drives', sortKey: 'drives', className: 'r' },
  { label: 'Candidates Viewed', sortKey: 'viewed', className: 'r' },
  { label: 'Shortlist Rate', sortKey: 'shortlist', className: 'r' },
  { label: 'Offer Rate', sortKey: 'offer', className: 'r' },
  { label: 'Response Time', sortKey: 'respHours', className: 'r' },
  { label: 'Status' },
  { label: 'Actions', className: 'r' },
];

const COLSPAN = COLUMNS.length + 1; // +1 for the checkbox column

// empColors from the prototype (line 3363) — cycled by a stable hash of the (string) id since
// real ids are Mongo ObjectIds rather than the prototype's small integers.
const EMP_COLORS = ['#2f4fe0', '#0aa3a3', '#7c5cff', '#f2a63b', '#0f9d58', '#d9314b'];

function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return EMP_COLORS[h % EMP_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// pctCls from the prototype (line 3690) — reused as-is for Shortlist/Offer Rate, same as the
// prototype's renderEmployers() (lines 3400-3401), even though the 75/50 thresholds are tuned for
// higher-magnitude funnel percentages elsewhere in the app.
function pctClass(v: number): string {
  return v >= 75 ? 'pct-good' : v >= 50 ? 'pct-mid' : 'pct-low';
}

// fmtResp from the prototype (line 3378), per the task brief's simplified formula (no
// zero-as-dash special case — 0h renders as "0h", matching how 0% shortlist/offer render here).
// Exported for reuse by index.tsx's CSV export (mirrors the prototype's #empExport handler,
// which formats Response Time via the same fmtResp).
export function fmtResp(h: number): string {
  return h < 24 ? `${h}h` : `${(h / 24).toFixed(1)}d`;
}

// Response-time color banding from the prototype (line 3402): lower is better.
function respClass(h: number): string {
  return h <= 12 ? 'pct-good' : h <= 24 ? 'pct-mid' : 'pct-low';
}

function sortIcon(active: boolean, order: 'asc' | 'desc'): string {
  if (!active) return 'ti-arrows-sort';
  return order === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending';
}

export function EmployersTable({
  items, selectedIds, onToggle, onToggleAll, onSort, sort, order, onRowAction, isLoading,
}: EmployersTableProps) {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.includes(i.id));
  // Local, presentation-only UI state (which row's overflow menu is open) — mirrors
  // InstitutesTable's per-row openMenuId so this stays a pure component driven by explicit props.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const act = (action: EmployerRowAction, id: string) => { setOpenMenuId(null); onRowAction(action, id); };

  return (
    <div className="dm-scroll">
      <table className="dm" style={{ minWidth: 1140 }}>
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
                <div className="dm-empty">Loading employers…</div>
              </td>
            </tr>
          )}
          {!isLoading && items.length === 0 && (
            <tr>
              <td colSpan={COLSPAN}>
                <div className="dm-empty">
                  <i className="ti ti-briefcase-off" />
                  No employers match these filters.
                  <br />
                  <span style={{ fontSize: 12.5 }}>Try clearing search or filters, or create a new employer.</span>
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
                      <b>{x.name}</b>
                      <span>{x.spoc}</span>
                    </div>
                  </div>
                </td>
                <td>{x.industry}</td>
                <td className="r cap">{x.activeDrives}</td>
                <td className="r cap">{x.candidatesViewed.toLocaleString('en-IN')}</td>
                <td className="r"><span className={`pct ${pctClass(x.shortlistRate)}`}>{x.shortlistRate}%</span></td>
                <td className="r"><span className={`pct ${pctClass(x.offerRate)}`}>{x.offerRate}%</span></td>
                <td className="r"><span className={`pct ${respClass(x.respHours)}`}>{fmtResp(x.respHours)}</span></td>
                <td><span className={`badge-st ${STATUS_CLASS[x.status]}`}><i className="ti ti-circle-filled" /> {x.status}</span></td>
                <td className="r" style={{ position: 'relative' }}>
                  <div className="rowact">
                    <button title="Edit" onClick={() => act('edit', x.id)}><i className="ti ti-edit" /></button>
                    <button title="More" onClick={() => setOpenMenuId(openMenuId === x.id ? null : x.id)}>
                      <i className="ti ti-dots-vertical" />
                    </button>
                  </div>
                  {openMenuId === x.id && (
                    <div className="kebab-menu show" style={{ top: '100%', right: 8 }}>
                      <button onClick={() => act('edit', x.id)}><i className="ti ti-edit" /> Edit employer</button>
                      <button onClick={() => act('view-drives', x.id)}><i className="ti ti-calendar-event" /> View drives</button>
                      {x.status === 'Pending' && (
                        <button onClick={() => act('approve', x.id)}><i className="ti ti-circle-check" /> Approve employer</button>
                      )}
                      {x.status !== 'Disabled' && (
                        <>
                          <hr />
                          <button className="danger" onClick={() => act('disable', x.id)}><i className="ti ti-ban" /> Disable employer</button>
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
