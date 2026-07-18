import { useState } from 'react';
import type { JobseekerListItem } from '../../types/jobseekers.js';

// Ported from matchday-admin-app_23.html lines 1666-1683 (table.dm inside .dm-table-wrap/.dm-scroll)
// and the renderJobseekers()/badge/evalCls/offerCls/dupCls/consentCls row template around lines
// 3956-4009. Like InstitutesTable.tsx, this renders only the `.dm-scroll > table.dm` portion — the
// outer `.dm-table-wrap` and `.dm-pager` are owned by index.tsx — so this stays a pure,
// isolated-testable presentational component (see JobseekersTable.test.tsx).
//
// The prototype's row actions are a direct "Edit" button plus a "More" kebab with Edit/Change
// stream/Reset evaluation/Block-or-Unblock (openJsKebab, lines 4029-4042) — mirrored here the same
// way EmployersTable.tsx ports its kebab. Change Stream opens a modal (ChangeStreamModal.tsx) that
// saves via the real PATCH /jobseekers/:id endpoint; Block/Unblock is fully wired; Reset Evaluation
// opens a confirmation modal (ResetEvaluationModal.tsx) that is UI-only pending backend integration.

export type JobseekerSortKey = 'name' | 'institute' | 'matchReady';
export type JobseekerRowAction = 'edit' | 'block' | 'unblock' | 'change-stream' | 'reset-evaluation';

export interface JobseekersTableProps {
  items: JobseekerListItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onSort: (key: JobseekerSortKey) => void;
  sort: string | undefined;
  order: 'asc' | 'desc';
  onRowAction: (action: JobseekerRowAction, id: string) => void;
  isLoading?: boolean;
}

// evalCls/offerCls/dupCls/consentCls from the prototype (lines 3957-3960), restricted to the
// values the real derived fields can actually take (evaluationLabel never returns 'Failed';
// dupRisk is 'High'|'Low' with no 'None' state — see jobseekers.service.ts).
const EVAL_CLASS: Record<string, string> = { Completed: 'st-active', 'In progress': 'st-published', 'Not started': 'st-draft' };
const OFFER_CLASS: Record<string, string> = { Joined: 'st-active', 'Offer sent': 'st-published', Shortlisted: 'st-teal', Rejected: 'st-danger', None: 'st-draft' };
const DUP_CLASS: Record<'High' | 'Low', string> = { High: 'st-danger', Low: 'st-pending' };
const CONSENT_CLASS: Record<'Granted' | 'Pending' | 'Revoked', string> = { Granted: 'st-active', Pending: 'st-pending', Revoked: 'st-danger' };

// pctCls thresholds from the jobseekers-specific renderJobseekers() (line 4001) — note these
// differ from InstitutesTable's 75/50 thresholds; each table ports its own prototype logic as-is.
function pctClass(v: number): string {
  return v >= 70 ? 'pct-good' : v >= 40 ? 'pct-mid' : 'pct-low';
}

function sortIcon(active: boolean, order: 'asc' | 'desc'): string {
  if (!active) return 'ti-arrows-sort';
  return order === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending';
}

interface Column { label: string; sortKey?: JobseekerSortKey; className?: string; }
const COLUMNS: Column[] = [
  { label: 'Candidate', sortKey: 'name' },
  { label: 'Institute', sortKey: 'institute' },
  { label: 'Stream' },
  { label: 'Evaluation' },
  { label: 'Match', sortKey: 'matchReady', className: 'r' },
  { label: 'Offer' },
  { label: 'Dup. Risk' },
  { label: 'Consent' },
  { label: 'Actions', className: 'r' },
];

const COLSPAN = COLUMNS.length + 1; // +1 for the checkbox column

export function JobseekersTable({
  items, selectedIds, onToggle, onToggleAll, onSort, sort, order, onRowAction, isLoading,
}: JobseekersTableProps) {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.includes(i.id));
  // Local, presentation-only UI state (which row's overflow menu is open) — mirrors
  // EmployersTable's per-row openMenuId so this stays a pure component driven by explicit props.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const act = (action: JobseekerRowAction, id: string) => { setOpenMenuId(null); onRowAction(action, id); };

  return (
    <div className="dm-scroll">
      <table className="dm" style={{ minWidth: 1120 }}>
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
            {COLUMNS.map((col) => {
              if (!col.sortKey) {
                return <th key={col.label} className={col.className}>{col.label}</th>;
              }
              const active = sort === col.sortKey;
              return (
                <th
                  key={col.label}
                  className={`sortable${col.className ? ` ${col.className}` : ''}${active ? ' sorted' : ''}`}
                  onClick={() => onSort(col.sortKey!)}
                >
                  {col.label} <i className={`ti ${sortIcon(active, order)} sa`} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={COLSPAN}>
                <div className="dm-empty">Loading candidates…</div>
              </td>
            </tr>
          )}
          {!isLoading && items.length === 0 && (
            <tr>
              <td colSpan={COLSPAN}>
                <div className="dm-empty">
                  <i className="ti ti-user-off" />
                  No candidates match these filters.
                  <br />
                  <span style={{ fontSize: 12.5 }}>Try clearing search or filters, or add a new candidate.</span>
                </div>
              </td>
            </tr>
          )}
          {!isLoading && items.map((x) => {
            const selected = selectedIds.includes(x.id);
            const blocked = x.consent === 'Revoked';
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
                  <div className="dm-name">
                    <b>
                      {x.name}{' '}
                      {blocked && <i className="ti ti-ban" style={{ color: 'var(--danger)', fontSize: 14 }} title="Blocked" />}
                    </b>
                    <span>{x.code}</span>
                  </div>
                </td>
                <td>{x.instituteName}</td>
                <td><span className="chip stream">{x.stream}</span></td>
                <td><span className={`badge-st ${EVAL_CLASS[x.evaluationLabel] ?? 'st-draft'}`}><i className="ti ti-circle-filled" /> {x.evaluationLabel}</span></td>
                <td className="r">
                  <span className={`pct ${pctClass(x.matchReadinessPct)}`}>{x.matchReadinessPct ? `${x.matchReadinessPct}%` : '—'}</span>
                </td>
                <td><span className={`badge-st ${OFFER_CLASS[x.offerStatus] ?? 'st-draft'}`}><i className="ti ti-circle-filled" /> {x.offerStatus}</span></td>
                <td><span className={`badge-st ${DUP_CLASS[x.dupRisk]}`}><i className="ti ti-circle-filled" /> {x.dupRisk}</span></td>
                <td><span className={`badge-st ${CONSENT_CLASS[x.consent]}`}><i className="ti ti-circle-filled" /> {x.consent}</span></td>
                <td className="r" style={{ position: 'relative' }}>
                  <div className="rowact">
                    <button title="Edit" onClick={() => act('edit', x.id)}><i className="ti ti-edit" /></button>
                    <button title="More" onClick={() => setOpenMenuId(openMenuId === x.id ? null : x.id)}>
                      <i className="ti ti-dots-vertical" />
                    </button>
                  </div>
                  {openMenuId === x.id && (
                    <div className="kebab-menu show" style={{ top: '100%', right: 8 }}>
                      <button onClick={() => act('edit', x.id)}><i className="ti ti-edit" /> Edit</button>
                      <button onClick={() => act('change-stream', x.id)}><i className="ti ti-git-branch" /> Change stream</button>
                      <button onClick={() => act('reset-evaluation', x.id)}><i className="ti ti-refresh" /> Reset evaluation</button>
                      <hr />
                      {blocked ? (
                        <button className="danger" onClick={() => act('unblock', x.id)}><i className="ti ti-ban" /> Unblock candidate</button>
                      ) : (
                        <button className="danger" onClick={() => act('block', x.id)}><i className="ti ti-ban" /> Block candidate</button>
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
