import type { ReactNode } from 'react';

export function sortIcon(active: boolean, order: 'asc' | 'desc'): string {
  if (!active) return 'ti-arrows-sort';
  return order === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending';
}

export interface SortableHeaderProps<K extends string = string> {
  label: string;
  sortKey?: K;
  className?: string;
  sort: string | undefined;
  order: 'asc' | 'desc';
  onSort: (key: K) => void;
  // Inline filter control (text input / select / range-picker trigger — see components/table/filters),
  // rendered always-visible in a row below the label, alongside the sort button.
  filter?: ReactNode;
}

// Column header: label on top, an inline filter control + dedicated sort button below it (matches
// the "Contest Id" / "Contest Status" / "Created At" reference — label, then a filter box with a
// small up/down icon beside it). Sorting is a small icon button rather than a whole-<th> click
// target, since the filter row below now contains real, focusable inputs.
export function SortableHeader<K extends string = string>({
  label, sortKey, className, sort, order, onSort, filter,
}: SortableHeaderProps<K>) {
  const active = !!sortKey && sort === sortKey;
  const hasRow = !!filter || !!sortKey;
  return (
    <th className={className}>
      <div className="col-label">{label}</div>
      {hasRow && (
        <div className="col-filter-row">
          {filter}
          {sortKey && (
            <button
              type="button"
              className={`col-sort-btn${active ? ' active' : ''}`}
              title={`Sort by ${label}`}
              onClick={() => onSort(sortKey)}
            >
              <i className={`ti ${sortIcon(active, order)} sa`} />
            </button>
          )}
        </div>
      )}
    </th>
  );
}
