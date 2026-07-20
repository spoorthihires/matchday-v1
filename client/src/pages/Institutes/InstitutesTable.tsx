import { useState } from 'react';
import type { InstituteListItem } from '../../types/institutes.js';
import { SortableHeader } from '../../components/table/SortableHeader.js';
import { EnumFilter, FilterPopover, RangeFilter, formatRangeSummary, type RangeValue } from '../../components/table/filters/index.js';
import { STATUS_OPTIONS, TYPE_OPTIONS } from './constants.js';

// Ported from matchday-admin-app_23.html lines 1507-1584 (table.dm inside .dm-table-wrap/.dm-scroll)
// and the renderInstitutes()/stCls/pctCls row template around lines 3700-3725.
// This component renders only the `.dm-scroll > table.dm` portion — the outer `.dm-table-wrap`
// and the `.dm-pager` are owned by index.tsx (mirrors DrivesTable.tsx) so this table stays a pure,
// isolated-testable presentational component (see InstitutesTable.test.tsx).

export type InstituteSortKey = 'name' | 'type' | 'uploaded' | 'signup' | 'completion' | 'matchReady' | 'shortlist' | 'offer' | 'joined';
export type InstituteRowAction = 'view' | 'edit' | 'approve' | 'disable';

export interface InstituteColumnFilters {
  type: string[];
  status: string[];
  uploaded: RangeValue;
  signup: RangeValue;
  completion: RangeValue;
  matchReady: RangeValue;
  shortlist: RangeValue;
  offer: RangeValue;
  joined: RangeValue;
}

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
  filters: InstituteColumnFilters;
  onFilterChange: <K extends keyof InstituteColumnFilters>(key: K, value: InstituteColumnFilters[K]) => void;
  onFilterClear: (key: keyof InstituteColumnFilters) => void;
}

// stCls from the prototype (line 3392/3710): Active→st-active, Pending→st-pending,
// Disabled→st-archived (verified against theme.css — there is no dedicated st-disabled class).
const STATUS_CLASS: Record<InstituteListItem['status'], string> = {
  Active: 'st-active',
  Pending: 'st-pending',
  Disabled: 'st-archived',
};

const COLSPAN = 12; // 11 columns (10 data + Actions) + 1 checkbox column

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

export function InstitutesTable({
  items, selectedIds, onToggle, onToggleAll, onSort, sort, order, onRowAction, isLoading,
  filters, onFilterChange, onFilterClear,
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
            <SortableHeader label="Institute" sortKey="name" sort={sort} order={order} onSort={onSort} />
            <SortableHeader
              label="Type" sortKey="type" sort={sort} order={order} onSort={onSort}
              filter={<EnumFilter options={TYPE_OPTIONS.map((t) => ({ value: t, label: t }))} value={filters.type} onChange={(v) => onFilterChange('type', v)} />}
            />
            <SortableHeader
              label="Uploaded" sortKey="uploaded" className="r" sort={sort} order={order} onSort={onSort}
              filter={
                <FilterPopover summary={formatRangeSummary(filters.uploaded, 'Select range')} active={!!(filters.uploaded.from || filters.uploaded.to)}>
                  {(close) => <RangeFilter type="number" value={filters.uploaded} onChange={(v) => onFilterChange('uploaded', v)} onClear={() => onFilterClear('uploaded')} close={close} />}
                </FilterPopover>
              }
            />
            <SortableHeader
              label="Signup" sortKey="signup" className="r" sort={sort} order={order} onSort={onSort}
              filter={
                <FilterPopover summary={formatRangeSummary(filters.signup, 'Select range')} active={!!(filters.signup.from || filters.signup.to)}>
                  {(close) => <RangeFilter type="number" value={filters.signup} onChange={(v) => onFilterChange('signup', v)} onClear={() => onFilterClear('signup')} close={close} />}
                </FilterPopover>
              }
            />
            <SortableHeader
              label="Completion" sortKey="completion" className="r" sort={sort} order={order} onSort={onSort}
              filter={
                <FilterPopover summary={formatRangeSummary(filters.completion, 'Select range')} active={!!(filters.completion.from || filters.completion.to)}>
                  {(close) => <RangeFilter type="number" value={filters.completion} onChange={(v) => onFilterChange('completion', v)} onClear={() => onFilterClear('completion')} close={close} />}
                </FilterPopover>
              }
            />
            <SortableHeader
              label="Match-Ready" sortKey="matchReady" className="r" sort={sort} order={order} onSort={onSort}
              filter={
                <FilterPopover summary={formatRangeSummary(filters.matchReady, 'Select range')} active={!!(filters.matchReady.from || filters.matchReady.to)}>
                  {(close) => <RangeFilter type="number" value={filters.matchReady} onChange={(v) => onFilterChange('matchReady', v)} onClear={() => onFilterClear('matchReady')} close={close} />}
                </FilterPopover>
              }
            />
            <SortableHeader
              label="Shortlist" sortKey="shortlist" className="r" sort={sort} order={order} onSort={onSort}
              filter={
                <FilterPopover summary={formatRangeSummary(filters.shortlist, 'Select range')} active={!!(filters.shortlist.from || filters.shortlist.to)}>
                  {(close) => <RangeFilter type="number" value={filters.shortlist} onChange={(v) => onFilterChange('shortlist', v)} onClear={() => onFilterClear('shortlist')} close={close} />}
                </FilterPopover>
              }
            />
            <SortableHeader
              label="Offer" sortKey="offer" className="r" sort={sort} order={order} onSort={onSort}
              filter={
                <FilterPopover summary={formatRangeSummary(filters.offer, 'Select range')} active={!!(filters.offer.from || filters.offer.to)}>
                  {(close) => <RangeFilter type="number" value={filters.offer} onChange={(v) => onFilterChange('offer', v)} onClear={() => onFilterClear('offer')} close={close} />}
                </FilterPopover>
              }
            />
            <SortableHeader
              label="Joined" sortKey="joined" className="r" sort={sort} order={order} onSort={onSort}
              filter={
                <FilterPopover summary={formatRangeSummary(filters.joined, 'Select range')} active={!!(filters.joined.from || filters.joined.to)}>
                  {(close) => <RangeFilter type="number" value={filters.joined} onChange={(v) => onFilterChange('joined', v)} onClear={() => onFilterClear('joined')} close={close} />}
                </FilterPopover>
              }
            />
            <th>
              <div className="col-label">Status</div>
              <div className="col-filter-row">
                <EnumFilter options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} value={filters.status} onChange={(v) => onFilterChange('status', v)} />
              </div>
            </th>
            <th className="r">Actions</th>
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
