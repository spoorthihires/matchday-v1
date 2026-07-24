import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.js';
import { EVAL_TYPES, type EvalConfigItem } from '../../types/evaluations.js';
import { useEvalConfigs } from './hooks/useEvalConfigs.js';
import { useEvalConfigMutations } from './hooks/useEvalConfigMutations.js';
import { EvalConfigCards, type EvalConfigAction } from './EvalConfigCards.js';
import { EvalConfigModal } from './EvalConfigModal.js';

type EditorState = { mode: 'create' } | { mode: 'edit'; config: EvalConfigItem } | null;

export function EvaluationsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const { data, isLoading, isError, error } = useEvalConfigs({ q, type, status });
  const { update, duplicate, remove } = useEvalConfigMutations();
  const items = data?.items ?? [];

  function onToggle(c: EvalConfigItem) { update.mutate({ id: c.id, body: { enabled: !c.enabled } }); }
  function onAction(action: EvalConfigAction, c: EvalConfigItem) {
    if (action === 'edit') setEditor({ mode: 'edit', config: c });
    else if (action === 'duplicate') duplicate.mutate(c.id);
    else if (action === 'toggle') onToggle(c);
    // eslint-disable-next-line no-alert
    else if (action === 'delete') { if (window.confirm(`Delete "${c.name}"?`)) remove.mutate(c.id); }
  }

  return (
    <AppShell crumb="Supply" title="Evaluation Management">
      <div className="content">
        <div className="dm-toolbar">
          <div className="dm-search"><i className="ti ti-search" /><input placeholder="Search configurations…" aria-label="Search evaluations" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>{EVAL_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select className="select" style={{ appearance: 'auto' }} aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option><option>Active</option><option>Inactive</option>
          </select>
          <div className="grow" />
          <button className="btn btn-ghost" onClick={() => navigate('/evaluations/monitor')}><i className="ti ti-activity-heartbeat" /> Live Monitoring</button>
          <button className="btn btn-accent" onClick={() => setEditor({ mode: 'create' })}><i className="ti ti-plus" /> Create Configuration</button>
        </div>
        {isError && <div className="card"><p style={{ padding: 20, color: 'var(--danger)' }}>Failed to load configurations: {error instanceof Error ? error.message : 'Unknown error'}</p></div>}
        {isLoading && <div className="dm-empty" style={{ padding: 20 }}>Loading configurations…</div>}
        {!isLoading && <EvalConfigCards items={items} onAction={onAction} onToggle={onToggle} />}
        {editor && <EvalConfigModal mode={editor.mode} config={editor.mode === 'edit' ? editor.config : undefined} onClose={() => setEditor(null)} />}
      </div>
    </AppShell>
  );
}
