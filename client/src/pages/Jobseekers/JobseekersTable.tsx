import { useState } from 'react';
import type { JobseekerListItem } from '../../types/jobseekers.js';
import { SortableHeader } from '../../components/table/SortableHeader.js';
import { EnumFilter } from '../../components/table/filters/index.js';
import { CONSENT_OPTIONS, EVAL_OPTIONS, OFFER_OPTIONS, STREAM_OPTIONS } from './constants.js';

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

export type JobseekerSortKey =
  | 'name' | 'institute' | 'stream' | 'evaluationStatus' | 'matchReady' | 'offerStatus' | 'dupRisk' | 'consent';
export type JobseekerRowAction = 'edit' | 'block' | 'unblock' | 'change-stream' | 'reset-evaluation';

export interface InstituteOption { id: string; name: string; }

export interface JobseekerColumnFilters {
  instituteId: string[];
  stream: string[];
  evaluationStatus: string[];
  offer: string[];
  dupRisk: string[];
  consent: string[];
}

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
  instituteOptions: InstituteOption[];
  filters: JobseekerColumnFilters;
  onFilterChange: <K extends keyof JobseekerColumnFilters>(key: K, value: JobseekerColumnFilters[K]) => void;
  onFilterClear: (key: keyof JobseekerColumnFilters) => void;
}

// evalCls/offerCls/dupCls/consentCls from the prototype (lines 3957-3960), restricted to the
// values the real derived fields can actually take (dupRisk is 'High'|'Low' with no 'None' state
// — see jobseekers.service.ts).
const EVAL_CLASS: Record<string, string> = { Completed: 'st-active', 'In progress': 'st-published', 'Not started': 'st-draft', Failed: 'st-danger' };
const OFFER_CLASS: Record<string, string> = { Joined: 'st-active', 'Offer sent': 'st-published', Shortlisted: 'st-teal', Rejected: 'st-danger', None: 'st-draft' };
const DUP_CLASS: Record<'High' | 'Low', string> = { High: 'st-danger', Low: 'st-pending' };
const CONSENT_CLASS: Record<'Granted' | 'Pending' | 'Revoked', string> = { Granted: 'st-active', Pending: 'st-pending', Revoked: 'st-danger' };

// pctCls thresholds from the jobseekers-specific renderJobseekers() (line 4001) — note these
// differ from InstitutesTable's 75/50 thresholds; each table ports its own prototype logic as-is.
function pctClass(v: number): string {
  return v >= 70 ? 'pct-good' : v >= 40 ? 'pct-mid' : 'pct-low';
}

const COLSPAN = 10; // 9 columns (8 data + Actions) + 1 checkbox column

export function JobseekersTable({
  items, selectedIds, onToggle, onToggleAll, onSort, sort, order, onRowAction, isLoading,
  instituteOptions, filters, onFilterChange, onFilterClear,
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
            <SortableHeader label="Candidate" sortKey="name" sort={sort} order={order} onSort={onSort} />
            <SortableHeader
              label="Institute" sortKey="institute" sort={sort} order={order} onSort={onSort}
              filter={
                <EnumFilter
                  options={instituteOptions.map((i) => ({ value: i.id, label: i.name }))}
                  value={filters.instituteId}
                  onChange={(v) => onFilterChange('instituteId', v)}
                />
              }
            />
            <SortableHeader
              label="Stream" sortKey="stream" sort={sort} order={order} onSort={onSort}
              filter={
                <EnumFilter
                  options={STREAM_OPTIONS.map((s) => ({ value: s, label: s }))}
                  value={filters.stream}
                  onChange={(v) => onFilterChange('stream', v)}
                />
              }
            />
            <SortableHeader
              label="Evaluation" sortKey="evaluationStatus" sort={sort} order={order} onSort={onSort}
              filter={
                <EnumFilter
                  options={EVAL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  value={filters.evaluationStatus}
                  onChange={(v) => onFilterChange('evaluationStatus', v)}
                />
              }
            />
            <SortableHeader label="Match" sortKey="matchReady" className="r" sort={sort} order={order} onSort={onSort} />
            <SortableHeader
              label="Offer" sortKey="offerStatus" sort={sort} order={order} onSort={onSort}
              filter={
                <EnumFilter
                  options={OFFER_OPTIONS.map((o) => ({ value: o, label: o }))}
                  value={filters.offer}
                  onChange={(v) => onFilterChange('offer', v)}
                />
              }
            />
            <SortableHeader
              label="Dup. Risk" sortKey="dupRisk" sort={sort} order={order} onSort={onSort}
              filter={
                <EnumFilter
                  options={[{ value: 'High', label: 'High' }, { value: 'Low', label: 'Low' }]}
                  value={filters.dupRisk}
                  onChange={(v) => onFilterChange('dupRisk', v)}
                />
              }
            />
            <SortableHeader
              label="Consent" sortKey="consent" sort={sort} order={order} onSort={onSort}
              filter={
                <EnumFilter
                  options={CONSENT_OPTIONS.map((c) => ({ value: c, label: c }))}
                  value={filters.consent}
                  onChange={(v) => onFilterChange('consent', v)}
                />
              }
            />
            <th className="r">Actions</th>
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
