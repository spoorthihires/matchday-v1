import { useState } from 'react';
import { AppShell } from '../../components/AppShell.js';
import { useInstitutes } from '../Institutes/hooks/useInstitutes.js';
import type { JobseekerListItem, JobseekerListParams } from '../../types/jobseekers.js';
import { BulkBar } from './BulkBar.js';
import { JobseekerModal } from './JobseekerModal.js';
import { JobseekersTable, type JobseekerRowAction, type JobseekerSortKey } from './JobseekersTable.js';
import { JobseekersToolbar } from './JobseekersToolbar.js';
import { ViewPills, type JobseekerView } from './ViewPills.js';
import { useJobseekerMutations } from './hooks/useJobseekerMutations.js';
import { useJobseekers } from './hooks/useJobseekers.js';

const ROWS_PER_PAGE_OPTIONS = [10, 20, 50];

// `modal` records *intent* (create vs. edit-with-jobseeker); when non-null we render
// <JobseekerModal> below in the corresponding mode (mirrors InstitutesPage's `modal` state).
type ModalState = { mode: 'create' } | { mode: 'edit'; jobseeker: JobseekerListItem } | null;

// A view pill activates exactly one contextual filter (see ViewPills.tsx/JobseekersToolbar.tsx),
// so a single `view` + `viewFilterValue` pair — rather than one field per lens — is enough state:
// switching views resets `viewFilterValue` to '' (clearing whichever filter was active) and only
// the query param matching the *current* view is ever populated below.
const EMPTY_VIEW_FILTER = '';

function csvEscape(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

// Self-wraps in AppShell (mirroring Institutes/Drives) — App.tsx must mount this directly under
// ProtectedRoute with no outer AppShell of its own.
export function JobseekersPage() {
  const [view, setView] = useState<JobseekerView>('all');
  const [viewFilterValue, setViewFilterValue] = useState(EMPTY_VIEW_FILTER);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<JobseekerSortKey | undefined>(undefined);
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  // TODO(Task 7): render <UploadWizard open={uploadOpen} onClose={() => setUploadOpen(false)} />
  // once the import wizard lands — for now the button just flips this flag; nothing renders yet.
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: institutesData } = useInstitutes({ limit: 100 });
  const instituteOptions = (institutesData?.items ?? []).map((i) => ({ id: i.id, name: i.name }));

  const params: JobseekerListParams = {
    q: q || undefined,
    sort, order, page, limit,
    ...(view === 'institute' && viewFilterValue ? { instituteId: viewFilterValue } : {}),
    ...(view === 'stream' && viewFilterValue ? { stream: viewFilterValue } : {}),
    ...(view === 'eval' && viewFilterValue ? { evaluationStatus: viewFilterValue } : {}),
    ...(view === 'match' && viewFilterValue ? { matchBucket: viewFilterValue } : {}),
    ...(view === 'offer' && viewFilterValue ? { offer: viewFilterValue } : {}),
    ...(view === 'consent' && viewFilterValue ? { consent: viewFilterValue } : {}),
  };
  const { data, isLoading, isError, error } = useJobseekers(params);
  const { block } = useJobseekerMutations();

  function handleViewChange(next: JobseekerView) {
    setView(next);
    setViewFilterValue(EMPTY_VIEW_FILTER);
    setPage(1);
  }

  function handleViewFilterChange(value: string) {
    setViewFilterValue(value);
    setPage(1);
  }

  function handleQChange(next: string) {
    setQ(next);
    setPage(1);
  }

  function handleSort(key: JobseekerSortKey) {
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

  function handleRowAction(action: JobseekerRowAction, id: string) {
    switch (action) {
      case 'edit': {
        const jobseeker = data?.items.find((i) => i.id === id);
        if (jobseeker) setModal({ mode: 'edit', jobseeker });
        break;
      }
      case 'block':
        if (window.confirm('Block this candidate?')) block.mutate({ ids: [id], action: 'block' });
        break;
    }
  }

  function handleCreate() {
    setModal({ mode: 'create' });
  }

  function handleBulkBlock() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Block ${selectedIds.length} candidate(s)?`)) return;
    block.mutate({ ids: selectedIds, action: 'block' }, { onSuccess: () => setSelectedIds([]) });
  }

  function handleExport() {
    const rows = data?.items ?? [];
    const head = ['Code', 'Name', 'Email', 'Institute', 'Stream', 'Evaluation', 'Match %', 'Offer', 'Dup. Risk', 'Consent'];
    const csv = [head.join(',')]
      .concat(rows.map((j) => [
        j.code, j.name, j.email, j.instituteName, j.stream, j.evaluationLabel, j.matchReadinessPct, j.offerStatus, j.dupRisk, j.consent,
      ].map(csvEscape).join(',')))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matchday-jobseekers.csv';
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
    <AppShell crumb="Supply" title="Jobseeker Management">
      <div className="content">
        <ViewPills view={view} onChange={handleViewChange} />

        <JobseekersToolbar
          q={q}
          view={view}
          viewFilterValue={viewFilterValue}
          instituteOptions={instituteOptions}
          onQChange={handleQChange}
          onViewFilterChange={handleViewFilterChange}
          onUpload={() => setUploadOpen((v) => !v)}
          onExport={handleExport}
          onCreate={handleCreate}
        />

        <BulkBar
          selectedCount={selectedIds.length}
          onBlock={handleBulkBlock}
          onClear={() => setSelectedIds([])}
        />

        {isError && (
          <div className="card">
            <p style={{ padding: '20px', color: 'var(--danger)' }}>
              Failed to load candidates: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        )}

        <div className="dm-table-wrap">
          <JobseekersTable
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
              {total ? <>Showing <b>{start + 1}–{start + shown}</b> of <b>{total}</b></> : 'No candidates'}
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
          <JobseekerModal
            mode={modal.mode}
            jobseeker={modal.mode === 'edit' ? modal.jobseeker : undefined}
            instituteOptions={instituteOptions}
            onClose={() => setModal(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
