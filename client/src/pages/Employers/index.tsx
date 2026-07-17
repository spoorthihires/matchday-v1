import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.js';
import { pagerWindow } from '../../utils/pagerWindow.js';
import type { EmployerListItem, EmployerListParams } from '../../types/employers.js';
import { BulkBar } from './BulkBar.js';
import { EmployerModal } from './EmployerModal.js';
import { EmployersTable, fmtResp, type EmployerRowAction, type EmployerSortKey } from './EmployersTable.js';
import { EmployersToolbar } from './EmployersToolbar.js';
import { useEmployerMutations } from './hooks/useEmployerMutations.js';
import { useEmployers } from './hooks/useEmployers.js';

const ROWS_PER_PAGE_OPTIONS = [8, 15, 25];

// `modal` records *intent* (create vs. edit-with-employer); when non-null we render
// <EmployerModal> below in the corresponding mode (mirrors InstitutesPage's `modal` state).
type ModalState = { mode: 'create' } | { mode: 'edit'; employer: EmployerListItem } | null;

interface Filters { q: string; industry: string; status: string; }
const EMPTY_FILTERS: Filters = { q: '', industry: '', status: '' };

function csvEscape(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

// Self-wraps in AppShell (mirroring Institutes/Jobseekers) — App.tsx must mount this directly
// under ProtectedRoute with no outer AppShell of its own.
export function EmployersPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<EmployerSortKey | undefined>(undefined);
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modal, setModal] = useState<ModalState>(null);

  const params: EmployerListParams = { ...filters, sort, order, page, limit };
  const { data, isLoading, isError, error } = useEmployers(params);
  const { bulk, setStatus } = useEmployerMutations();

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  function handleSort(key: EmployerSortKey) {
    if (sort === key) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder('asc');
    }
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

  function handleRowAction(action: EmployerRowAction, id: string) {
    if (action === 'view-drives') { navigate(`/slots?employerId=${id}`); return; }
    switch (action) {
      case 'edit': {
        const employer = data?.items.find((i) => i.id === id);
        if (employer) setModal({ mode: 'edit', employer });
        break;
      }
      case 'approve':
        setStatus.mutate({ id, status: 'Active' });
        break;
      case 'disable':
        if (window.confirm('Disable this employer?')) setStatus.mutate({ id, status: 'Disabled' });
        break;
    }
  }

  function handleCreate() {
    setModal({ mode: 'create' });
  }

  function handleBulk(action: 'approve' | 'disable') {
    if (selectedIds.length === 0) return;
    if (action === 'disable' && !window.confirm(`Disable ${selectedIds.length} employer(s)?`)) return;
    bulk.mutate({ ids: selectedIds, action }, { onSuccess: () => setSelectedIds([]) });
  }

  function handleExport() {
    const rows = data?.items ?? [];
    const head = ['Employer', 'Industry', 'Active Drives', 'Candidates Viewed', 'Shortlist Rate', 'Offer Rate', 'Response Time', 'Status'];
    const csv = [head.join(',')]
      .concat(rows.map((x) => [
        x.name, x.industry, x.activeDrives, x.candidatesViewed, `${x.shortlistRate}%`, `${x.offerRate}%`, fmtResp(x.respHours), x.status,
      ].map(csvEscape).join(',')))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matchday-employers.csv';
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
    <AppShell crumb="Demand" title="Employer Management">
      <div className="content">
        <EmployersToolbar
          q={filters.q}
          industry={filters.industry}
          status={filters.status}
          onQChange={(v) => updateFilter('q', v)}
          onIndustryChange={(v) => updateFilter('industry', v)}
          onStatusChange={(v) => updateFilter('status', v)}
          onApprovals={() => navigate('/employers/approvals')}
          onExport={handleExport}
          onCreate={handleCreate}
        />

        <BulkBar
          selectedCount={selectedIds.length}
          onApprove={() => handleBulk('approve')}
          onDisable={() => handleBulk('disable')}
          onClear={() => setSelectedIds([])}
        />

        {isError && (
          <div className="card">
            <p style={{ padding: '20px', color: 'var(--danger)' }}>
              Failed to load employers: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        )}

        <div className="dm-table-wrap">
          <EmployersTable
            items={data?.items ?? []}
            selectedIds={selectedIds}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onSort={handleSort}
            sort={sort}
            order={order}
            onRowAction={handleRowAction}
            isLoading={isLoading}
          />
          <div className="dm-pager">
            <div className="pinfo">
              {total ? <>Showing <b>{start + 1}–{start + shown}</b> of <b>{total}</b> employers</> : 'No employers'}
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
              {pagerWindow(effPage, pages).map((p, i) =>
                p === '…' ? (
                  <span key={`gap-${i}`} className="pbtn gap" aria-hidden="true">…</span>
                ) : (
                  <button key={p} className={`pbtn${p === effPage ? ' on' : ''}`} disabled={p === effPage} onClick={() => setPage(p)}>
                    {p}
                  </button>
                ),
              )}
              <button className="pbtn" disabled={effPage >= pages} onClick={() => setPage(effPage + 1)}>
                <i className="ti ti-chevron-right" />
              </button>
            </div>
          </div>
        </div>

        {modal && (
          <EmployerModal
            mode={modal.mode}
            employer={modal.mode === 'edit' ? modal.employer : undefined}
            onClose={() => setModal(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
