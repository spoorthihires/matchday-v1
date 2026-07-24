import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.js';
import { useTableSort } from '../../hooks/useTableSort.js';
import { useColumnFilters } from '../../hooks/useColumnFilters.js';
import { PARENTS, type StreamItem } from '../../types/streams.js';
import { useStreams } from './hooks/useStreams.js';
import { useStreamMutations } from './hooks/useStreamMutations.js';
import { StreamTable, type StreamAction, type StreamSortKey } from './StreamTable.js';
import { StreamEditorModal } from './StreamEditorModal.js';
import { StreamVersionHistoryModal } from './StreamVersionHistoryModal.js';

type EditorState = { mode: 'create' } | { mode: 'edit'; stream: StreamItem } | null;

export function StreamsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [versions, setVersions] = useState<StreamItem | null>(null);
  const { sort, order, onSort } = useTableSort<StreamSortKey>('name');
  const columnFilters = useColumnFilters({
    parent: [] as string[], status: [] as string[], cutoff: {} as { from?: string; to?: string },
  });

  const { data, isLoading, isError, error } = useStreams({ q, sort, order, ...columnFilters.toQueryParams() });
  const { update } = useStreamMutations();
  const items = data?.items ?? [];

  function onAction(action: StreamAction, s: StreamItem) {
    if (action === 'edit') setEditor({ mode: 'edit', stream: s });
    else if (action === 'version') setVersions(s);
    else if (action === 'toggle') update.mutate({ id: s.id, body: { status: s.status === 'Active' ? 'Disabled' : 'Active' } });
  }
  function exportCsv() {
    const head = ['Stream Name', 'Parent Category', 'Employer Label', 'Skills Required', 'Good To Have', 'Evaluation Flow', 'Cutoff Score', 'Min CGPA', 'Max Backlogs', 'Graduation Years', 'Allowed Branches', 'Candidate Sources', 'Version', 'Status'];
    const rows = items.map((s) => [s.name, s.parent, s.label, s.skills.join('; '), s.good.join('; '), s.flow.join(' > '), s.cutoff, s.cgpa, s.backlogs, s.grad.join('; '), s.branches.join('; '), s.sources.join('; '), s.version, s.status].map((v) => `"${v}"`).join(','));
    const csv = [head.join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'matchday-streams.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <AppShell crumb="Configuration" title="Stream Configuration">
      <div className="content">
        <div className="dm-toolbar">
          <div className="dm-search"><i className="ti ti-search" /><input placeholder="Search streams by name, skill or label…" aria-label="Search streams" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select
            className="select" style={{ appearance: 'auto' }} aria-label="Filter by category"
            value={columnFilters.filters.parent[0] ?? ''}
            onChange={(e) => columnFilters.setFilter('parent', e.target.value ? [e.target.value] : [])}
          >
            <option value="">All categories</option>{PARENTS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select
            className="select" style={{ appearance: 'auto' }} aria-label="Filter by status"
            value={columnFilters.filters.status[0] ?? ''}
            onChange={(e) => columnFilters.setFilter('status', e.target.value ? [e.target.value] : [])}
          >
            <option value="">All statuses</option><option>Active</option><option>Disabled</option>
          </select>
          <div className="grow" />
          <button className="btn btn-ghost" onClick={() => navigate('/streams/rules')}><i className="ti ti-adjustments" /> Selection Rules</button>
          <button className="btn btn-ghost" onClick={exportCsv}><i className="ti ti-download" /> Export</button>
          <button className="btn btn-accent" onClick={() => setEditor({ mode: 'create' })}><i className="ti ti-plus" /> Create Stream</button>
        </div>
        {isError && <div className="card"><p style={{ padding: 20, color: 'var(--danger)' }}>Failed to load streams: {error instanceof Error ? error.message : 'Unknown error'}</p></div>}
        {isLoading && <div className="dm-empty" style={{ padding: 20 }}>Loading streams…</div>}
        {!isLoading && (
          <StreamTable
            items={items} sort={sort} order={order} onSort={onSort} onAction={onAction}
            filters={columnFilters.filters}
            onFilterChange={columnFilters.setFilter}
            onFilterClear={columnFilters.clearFilter}
          />
        )}
        {editor && <StreamEditorModal mode={editor.mode} stream={editor.mode === 'edit' ? editor.stream : undefined} onClose={() => setEditor(null)} />}
        {versions && <StreamVersionHistoryModal stream={versions} onClose={() => setVersions(null)} />}
      </div>
    </AppShell>
  );
}
