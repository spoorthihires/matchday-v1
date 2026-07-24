import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.js';
import { useTableSort } from '../../hooks/useTableSort.js';
import { useColumnFilters } from '../../hooks/useColumnFilters.js';
import type { InstituteListItem, InstituteListParams } from '../../types/institutes.js';
import { BulkAssignDrivesModal } from './BulkAssignDrivesModal.js';
import { BulkBar } from './BulkBar.js';
import { InstituteModal } from './InstituteModal.js';
import { InstitutesTable, type InstituteRowAction, type InstituteSortKey } from './InstitutesTable.js';
import { InstitutesToolbar } from './InstitutesToolbar.js';
import { useInstituteMutations } from './hooks/useInstituteMutations.js';
import { useInstitutes } from './hooks/useInstitutes.js';

const ROWS_PER_PAGE_OPTIONS = [8, 15, 25];

// `modal` records *intent* (create vs. edit-with-institute); when non-null we render
// <InstituteModal> below in the corresponding mode (mirrors DrivesPage's `wizard` state).
type ModalState = { mode: 'create' } | { mode: 'edit'; institute: InstituteListItem } | null;

interface Filters { q: string; type: string; status: string; }
const EMPTY_FILTERS: Filters = { q: '', type: '', status: '' };

function csvEscape(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

// Self-wraps in AppShell (mirroring Drives/index.tsx) — App.tsx must mount this directly under
// ProtectedRoute with no outer AppShell of its own.
export function InstitutesPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const { sort, order, onSort } = useTableSort<InstituteSortKey>(undefined, () => setPage(1));
  const columnFilters = useColumnFilters(
    {
      type: [] as string[], status: [] as string[],
      uploaded: {} as { from?: string; to?: string },
      signup: {} as { from?: string; to?: string },
      completion: {} as { from?: string; to?: string },
      matchReady: {} as { from?: string; to?: string },
      shortlist: {} as { from?: string; to?: string },
      offer: {} as { from?: string; to?: string },
      joined: {} as { from?: string; to?: string },
    },
    () => setPage(1),
  );
  const [limit, setLimit] = useState(8);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);

  const params: InstituteListParams = { ...filters, sort, order, page, limit, ...columnFilters.toQueryParams() };
  const { data, isLoading, isError, error } = useInstitutes(params);
  const { bulk, setStatus } = useInstituteMutations();

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
    const pageIds = (data?.items ?? []).map((i) => i.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    setSelectedIds((ids) => (allSelected ? ids.filter((id) => !pageIds.includes(id)) : [...new Set([...ids, ...pageIds])]));
  }

  function handleRowAction(action: InstituteRowAction, id: string) {
    switch (action) {
      case 'view':
        navigate(`/institutes/${id}`);
        break;
      case 'edit': {
        const institute = data?.items.find((i) => i.id === id);
        if (institute) setModal({ mode: 'edit', institute });
        break;
      }
      case 'approve':
        setStatus.mutate({ id, status: 'Active' });
        break;
      case 'disable':
        if (window.confirm('Disable this institute?')) setStatus.mutate({ id, status: 'Disabled' });
        break;
    }
  }

  function handleCreate() {
    setModal({ mode: 'create' });
  }

  function handleBulk(action: 'approve' | 'disable') {
    if (selectedIds.length === 0) return;
    if (action === 'disable' && !window.confirm(`Disable ${selectedIds.length} institute(s)?`)) return;
    bulk.mutate({ ids: selectedIds, action }, { onSuccess: () => setSelectedIds([]) });
  }

  function handleExport() {
    const rows = data?.items ?? [];
    const head = ['Institute Name', 'City', 'Type', 'Owner', 'Email', 'Uploaded', 'Signup %', 'Completion %', 'Match-Ready %', 'Shortlist %', 'Offer %', 'Joined %', 'Status'];
    const csv = [head.join(',')]
      .concat(rows.map((i) => [
        i.name, i.city, i.type, i.owner, i.email, i.uploaded,
        i.signupPct, i.completionPct, i.matchReadyPct, i.shortlistPct, i.offerPct, i.joinedPct, i.status,
      ].map(csvEscape).join(',')))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matchday-institutes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = data?.total ?? 0;
  const effLimit = data?.limit ?? limit;
  const effPage = data?.page ?? page;
  const pages = Math.max(1, Math.ceil(total / effLimit));
  const start = (effPage - 1) * effLimit;
  const shown = data?.items.length ?? 0;
  const overview = data?.overview;

  return (
    <AppShell crumb="Supply" title="Institute Management">
      <div className="content">
        <div className="section-title" style={{ marginTop: 6 }}>Overview <span className="rule" /></div>
        <div className="kpis" style={{ marginBottom: 6 }}>
          <div className="kpi">
            <div className="kh"><span className="ic i-indigo"><i className="ti ti-building-community" /></span> Total Institutes</div>
            <div className="kv mono">{overview?.total ?? 0}</div>
            <div className="kd flat"><i className="ti ti-minus" /> participating</div>
          </div>
          <div className="kpi">
            <div className="kh"><span className="ic i-amber"><i className="ti ti-clock-hour-4" /></span> Pending Approval</div>
            <div className="kv mono">{overview?.pending ?? 0}</div>
            <div className="kd flat"><i className="ti ti-alert-circle" /> needs review</div>
          </div>
          <div className="kpi">
            <div className="kh"><span className="ic i-teal"><i className="ti ti-user-plus" /></span> Jobseekers Uploaded</div>
            <div className="kv mono">{(overview?.uploaded ?? 0).toLocaleString('en-IN')}</div>
            <div className="kd up"><i className="ti ti-trending-up" /> total</div>
          </div>
          <div className="kpi">
            <div className="kh"><span className="ic i-green"><i className="ti ti-user-check" /></span> Avg Match-Ready</div>
            <div className="kv mono">{overview?.avgMatchReadyPct ?? 0}%</div>
            <div className="kd up"><i className="ti ti-trending-up" /> across active</div>
          </div>
        </div>

        <InstitutesToolbar
          q={filters.q}
          type={filters.type}
          status={filters.status}
          onQChange={(v) => updateFilter('q', v)}
          onTypeChange={(v) => updateFilter('type', v)}
          onStatusChange={(v) => updateFilter('status', v)}
          onExport={handleExport}
          onCreate={handleCreate}
          onOwnership={() => navigate('/institutes/ownership')}
        />

        <BulkBar
          selectedCount={selectedIds.length}
          onApprove={() => handleBulk('approve')}
          onAssignDrives={() => setBulkAssignOpen(true)}
          onDisable={() => handleBulk('disable')}
          onClear={() => setSelectedIds([])}
        />

        {isError && (
          <div className="card">
            <p style={{ padding: '20px', color: 'var(--danger)' }}>
              Failed to load institutes: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        )}

        <div className="dm-table-wrap">
          <InstitutesTable
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
              {total ? <>Showing <b>{start + 1}–{start + shown}</b> of <b>{total}</b> institutes</> : 'No institutes'}
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

        {modal && (
          <InstituteModal
            mode={modal.mode}
            institute={modal.mode === 'edit' ? modal.institute : undefined}
            onClose={() => setModal(null)}
          />
        )}

        {bulkAssignOpen && (
          <BulkAssignDrivesModal
            instituteIds={[...selectedIds]}
            onClose={() => { setBulkAssignOpen(false); setSelectedIds([]); }}
          />
        )}
      </div>
    </AppShell>
  );
}
