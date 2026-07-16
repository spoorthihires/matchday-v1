import { useState } from 'react';
import { AppShell } from '../../components/AppShell.js';
import { TEMPLATE_DOMAINS, type TemplateItem } from '../../types/templates.js';
import { useTemplates } from './hooks/useTemplates.js';
import { useTemplateMutations } from './hooks/useTemplateMutations.js';
import { TemplateCards, type TemplateAction } from './TemplateCards.js';
import { TemplateTable } from './TemplateTable.js';
import { TemplateEditorModal } from './TemplateEditorModal.js';
import { VersionHistoryModal } from './VersionHistoryModal.js';

type EditorState = { mode: 'create' } | { mode: 'edit'; template: TemplateItem } | null;

export function TemplatesPage() {
  const [q, setQ] = useState('');
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [editor, setEditor] = useState<EditorState>(null);
  const [versions, setVersions] = useState<TemplateItem | null>(null);

  const { data, isLoading, isError, error } = useTemplates({ q, domain, status });
  const { update, clone, remove } = useTemplateMutations();
  const items = data?.items ?? [];

  function onAction(action: TemplateAction, t: TemplateItem) {
    if (action === 'edit') setEditor({ mode: 'edit', template: t });
    else if (action === 'clone') clone.mutate(t.id);
    else if (action === 'version') setVersions(t);
    else if (action === 'toggle') {
      update.mutate({ id: t.id, body: { status: t.status === 'Active' ? 'Inactive' : 'Active' } });
    } else if (action === 'delete') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Delete "${t.name}"? This cannot be undone.`)) remove.mutate(t.id);
    }
  }

  return (
    <AppShell crumb="Library" title="Drive Templates">
      <div className="content">
        <div className="dm-toolbar">
          <div className="dm-search">
            <i className="ti ti-search" />
            <input
              placeholder="Search templates by name or domain…" aria-label="Search templates"
              value={q} onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by domain" value={domain} onChange={(e) => setDomain(e.target.value)}>
            <option value="">All domains</option>
            {TEMPLATE_DOMAINS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option>Active</option><option>Inactive</option>
          </select>
          <div className="grow" />
          <span className="seg" role="tablist" aria-label="Template view">
            <button className={view === 'cards' ? 'on' : undefined} aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
              <i className="ti ti-layout-grid" /> Cards
            </button>
            <button className={view === 'table' ? 'on' : undefined} aria-pressed={view === 'table'} onClick={() => setView('table')}>
              <i className="ti ti-table" /> Table
            </button>
          </span>
          <button className="btn btn-primary" onClick={() => setEditor({ mode: 'create' })}>
            <i className="ti ti-plus" /> Create Template
          </button>
        </div>

        {isError && (
          <div className="card"><p style={{ padding: 20, color: 'var(--danger)' }}>
            Failed to load templates: {error instanceof Error ? error.message : 'Unknown error'}
          </p></div>
        )}
        {isLoading && <div className="dm-empty" style={{ padding: 20 }}>Loading templates…</div>}

        {!isLoading && view === 'cards' && <TemplateCards items={items} onAction={onAction} />}
        {!isLoading && view === 'table' && <TemplateTable items={items} onAction={onAction} />}

        {editor && (
          <TemplateEditorModal
            mode={editor.mode}
            template={editor.mode === 'edit' ? editor.template : undefined}
            onClose={() => setEditor(null)}
          />
        )}
        {versions && <VersionHistoryModal template={versions} onClose={() => setVersions(null)} />}
      </div>
    </AppShell>
  );
}
