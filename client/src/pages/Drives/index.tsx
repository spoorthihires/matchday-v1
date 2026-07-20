import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.js';
import { useTableSort } from '../../hooks/useTableSort.js';
import { useColumnFilters } from '../../hooks/useColumnFilters.js';
import type { DriveListParams } from '../../types/drives.js';
import { BulkBar } from './BulkBar.js';
import { DrivesTable, type DriveRowAction, type DriveSortKey } from './DrivesTable.js';
import { DrivesToolbar } from './DrivesToolbar.js';
import { useDriveMutations } from './hooks/useDriveMutations.js';
import { useDrives } from './hooks/useDrives.js';
import { DriveWizard } from './wizard/DriveWizard.js';

const ROWS_PER_PAGE_OPTIONS = [8, 15, 25];

// `wizard` records *intent* (create vs. edit-with-id); when non-null we render <DriveWizard>
// below in create or edit mode.
type WizardState = { mode: 'create' } | { mode: 'edit'; id: string } | null;

interface Filters { q: string; status: string; month: string; stream: string; domain: string; }
const EMPTY_FILTERS: Filters = { q: '', status: '', month: '', stream: '', domain: '' };

function csvEscape(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

// Self-wraps in AppShell (mirroring Dashboard/ComingSoon) — App.tsx must mount this directly
// under ProtectedRoute with no outer AppShell of its own.
export function DrivesPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const { sort, order, onSort } = useTableSort<DriveSortKey>(undefined, () => setPage(1));
  const columnFilters = useColumnFilters(
    {
      domain: [] as string[], stream: [] as string[], status: [] as string[],
      month: {} as { from?: string; to?: string },
      candCap: {} as { from?: string; to?: string },
      empCap: {} as { from?: string; to?: string },
      slotCap: {} as { from?: string; to?: string },
    },
    () => setPage(1),
  );
  const [limit, setLimit] = useState(8);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [wizard, setWizard] = useState<WizardState>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Cross-page "New Drive" wiring (Command Center → /drives?new=1): open the create wizard once
  // on mount when the query param is present, then strip it so a later refresh/back-nav doesn't
  // reopen it.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setWizard({ mode: 'create' });
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
    // Intentionally run once on mount only — re-running on every searchParams change would
    // reopen the wizard right after `new` is stripped above.
  }, []);

  const params: DriveListParams = { ...filters, sort, order, page, limit, ...columnFilters.toQueryParams() };
  const { data, isLoading, isError, error } = useDrives(params);
  const { clone, bulk, setStatus } = useDriveMutations();

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  function handleLimitChange(next: number) {
    setLimit(next);
    setPage(1);
  }

  function toggle(id: string) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function toggleAll() {
    const pageIds = (data?.items ?? []).map((d) => d.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    setSelectedIds((ids) => (allSelected ? ids.filter((id) => !pageIds.includes(id)) : [...new Set([...ids, ...pageIds])]));
  }

  function handleRowAction(action: DriveRowAction, id: string) {
    switch (action) {
      case 'edit':
        setWizard({ mode: 'edit', id });
        break;
      case 'clone':
        clone.mutate(id);
        break;
      case 'publish':
        setStatus.mutate({ id, status: 'Published' });
        break;
      case 'archive':
        if (window.confirm('Archive this drive?')) setStatus.mutate({ id, status: 'Archived' });
        break;
    }
  }

  function handleCreate() {
    setWizard({ mode: 'create' });
  }

  function handleBulk(action: 'publish' | 'clone' | 'archive') {
    if (selectedIds.length === 0) return;
    if (action === 'archive' && !window.confirm(`Archive ${selectedIds.length} drive(s)?`)) return;
    bulk.mutate({ ids: selectedIds, action }, { onSuccess: () => setSelectedIds([]) });
  }

  function handleExport() {
    const rows = data?.items ?? [];
    const head = ['Drive Name', 'Domain', 'Stream', 'Month', 'Frequency', 'Event Day', 'Candidate Capacity', 'Employer Capacity', 'Slot Capacity', 'Status', 'Created By'];
    const csv = [head.join(',')]
      .concat(rows.map((d) => [d.name, d.domain, d.stream, d.month, d.frequency, d.eventDay, d.candCap, d.empCap, d.slotCap, d.status, d.createdBy].map(csvEscape).join(',')))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matchday-drives.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = data?.total ?? 0;
  const effLimit = data?.limit ?? limit;
  const effPage = data?.page ?? page;
  const pages = Math.max(1, Math.ceil(total / effLimit));
  const start = (effPage - 1) * effLimit;
  const shown = data?.items.length ?? 0;

  return (
    <AppShell crumb="Operations" title="Drive Management">
      <div className="content">
        <DrivesToolbar
          q={filters.q}
          status={filters.status}
          month={filters.month}
          stream={filters.stream}
          domain={filters.domain}
          onQChange={(v) => updateFilter('q', v)}
          onStatusChange={(v) => updateFilter('status', v)}
          onMonthChange={(v) => updateFilter('month', v)}
          onStreamChange={(v) => updateFilter('stream', v)}
          onDomainChange={(v) => updateFilter('domain', v)}
          onExport={handleExport}
          onCreate={handleCreate}
        />

        <BulkBar
          selectedCount={selectedIds.length}
          onPublish={() => handleBulk('publish')}
          onClone={() => handleBulk('clone')}
          onArchive={() => handleBulk('archive')}
          onClear={() => setSelectedIds([])}
        />

        {isError && (
          <div className="card">
            <p style={{ padding: '20px', color: 'var(--danger)' }}>
              Failed to load drives: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        )}

        <div className="dm-table-wrap">
          <DrivesTable
            items={data?.items ?? []}
            selectedIds={selectedIds}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onSort={onSort}
            sort={sort}
            order={order}
            onRowAction={handleRowAction}
            isLoading={isLoading}
            filters={columnFilters.filters}
            onFilterChange={columnFilters.setFilter}
            onFilterClear={columnFilters.clearFilter}
          />
          <div className="dm-pager">
            <div className="pinfo">
              {total ? <>Showing <b>{start + 1}–{start + shown}</b> of <b>{total}</b> drives</> : 'No drives'}
            </div>
            <div className="rpp">
              Rows: <select value={limit} onChange={(e) => handleLimitChange(Number(e.target.value))}>
                {ROWS_PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="pctrl">
              <button className="pbtn" disabled={effPage <= 1} onClick={() => setPage(effPage - 1)}>
                <i className="ti ti-chevron-left" />
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <button key={p} className={`pbtn${p === effPage ? ' on' : ''}`} disabled={p === effPage} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
              <button className="pbtn" disabled={effPage >= pages} onClick={() => setPage(effPage + 1)}>
                <i className="ti ti-chevron-right" />
              </button>
            </div>
          </div>
        </div>

        {wizard && (
          <DriveWizard
            mode={wizard.mode}
            driveId={wizard.mode === 'edit' ? wizard.id : undefined}
            onClose={() => setWizard(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
