import { useState } from 'react';
import type { DriveListItem } from '../../types/drives.js';
import { SortableHeader } from '../../components/table/SortableHeader.js';
import { EnumFilter, FilterPopover, RangeFilter, formatRangeSummary, type RangeValue } from '../../components/table/filters/index.js';

// Ported from matchday-admin-app_23.html lines 1367-1389 (table.dm inside .dm-table-wrap/.dm-scroll)
// and the renderDrives()/stClass row template around lines 2460-2487.
// This component renders only the `.dm-scroll > table.dm` portion — the outer `.dm-table-wrap`
// and the `.dm-pager` (a sibling of `.dm-scroll` in the prototype) are owned by index.tsx so
// this table stays a pure, isolated-testable presentational component (see DrivesTable.test.tsx).

export type DriveSortKey = 'name' | 'domain' | 'stream' | 'month' | 'candCap' | 'empCap' | 'slotCap' | 'status';
export type DriveRowAction = 'edit' | 'clone' | 'publish' | 'archive';

export interface DriveColumnFilters {
  domain: string[];
  stream: string[];
  status: string[];
  month: RangeValue;
  candCap: RangeValue;
  empCap: RangeValue;
  slotCap: RangeValue;
}

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
  filters: DriveColumnFilters;
  onFilterChange: <K extends keyof DriveColumnFilters>(key: K, value: DriveColumnFilters[K]) => void;
  onFilterClear: (key: keyof DriveColumnFilters) => void;
}

const STATUS_OPTIONS = ['Active', 'Published', 'Draft', 'Archived'];
const STREAM_OPTIONS = ['B.Tech', 'M.Tech', 'MCA', 'MBA'];
const DOMAIN_OPTIONS = ['Frontend', 'Backend', 'Full-stack', 'Data / ML', 'DevOps'];

const STATUS_CLASS: Record<DriveListItem['status'], string> = {
  Active: 'st-active',
  Published: 'st-published',
  Draft: 'st-draft',
  Archived: 'st-archived',
};

const COLSPAN = 13; // 12 columns (11 data + Actions) + 1 checkbox column

function num(n: number): string {
  return n.toLocaleString('en-IN');
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function DrivesTable({
  items, selectedIds, onToggle, onToggleAll, onSort, sort, order, onRowAction, isLoading,
  filters, onFilterChange, onFilterClear,
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
            <SortableHeader label="Drive Name" sortKey="name" sort={sort} order={order} onSort={onSort} />
            <SortableHeader
              label="Domain" sortKey="domain" sort={sort} order={order} onSort={onSort}
              filter={<EnumFilter options={DOMAIN_OPTIONS.map((d) => ({ value: d, label: d }))} value={filters.domain} onChange={(v) => onFilterChange('domain', v)} />}
            />
            <SortableHeader
              label="Stream" sortKey="stream" sort={sort} order={order} onSort={onSort}
              filter={<EnumFilter options={STREAM_OPTIONS.map((s) => ({ value: s, label: s }))} value={filters.stream} onChange={(v) => onFilterChange('stream', v)} />}
            />
            <SortableHeader
              label="Month" sortKey="month" sort={sort} order={order} onSort={onSort}
              filter={
                <FilterPopover summary={formatRangeSummary(filters.month, 'Select date range')} active={!!(filters.month.from || filters.month.to)}>
                  {(close) => <RangeFilter type="date" value={filters.month} onChange={(v) => onFilterChange('month', v)} onClear={() => onFilterClear('month')} close={close} />}
                </FilterPopover>
              }
            />
            <th>Frequency</th>
            <th>Event Day</th>
            <SortableHeader
              label="Cand. Cap" sortKey="candCap" className="r" sort={sort} order={order} onSort={onSort}
              filter={
                <FilterPopover summary={formatRangeSummary(filters.candCap, 'Select range')} active={!!(filters.candCap.from || filters.candCap.to)}>
                  {(close) => <RangeFilter type="number" value={filters.candCap} onChange={(v) => onFilterChange('candCap', v)} onClear={() => onFilterClear('candCap')} close={close} />}
                </FilterPopover>
              }
            />
            <SortableHeader
              label="Emp. Cap" sortKey="empCap" className="r" sort={sort} order={order} onSort={onSort}
              filter={
                <FilterPopover summary={formatRangeSummary(filters.empCap, 'Select range')} active={!!(filters.empCap.from || filters.empCap.to)}>
                  {(close) => <RangeFilter type="number" value={filters.empCap} onChange={(v) => onFilterChange('empCap', v)} onClear={() => onFilterClear('empCap')} close={close} />}
                </FilterPopover>
              }
            />
            <SortableHeader
              label="Slot Cap" sortKey="slotCap" className="r" sort={sort} order={order} onSort={onSort}
              filter={
                <FilterPopover summary={formatRangeSummary(filters.slotCap, 'Select range')} active={!!(filters.slotCap.from || filters.slotCap.to)}>
                  {(close) => <RangeFilter type="number" value={filters.slotCap} onChange={(v) => onFilterChange('slotCap', v)} onClear={() => onFilterClear('slotCap')} close={close} />}
                </FilterPopover>
              }
            />
            <SortableHeader
              label="Status" sortKey="status" sort={sort} order={order} onSort={onSort}
              filter={<EnumFilter options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} value={filters.status} onChange={(v) => onFilterChange('status', v)} />}
            />
            <th>Created By</th>
            <th className="r">Actions</th>
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
