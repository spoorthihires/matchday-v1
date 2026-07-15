import { useState } from 'react';
import { useInstituteAudit } from '../hooks/useInstituteAudit.js';

// Ported from matchday-admin-app_23.html's renderIdAudit() (lines ~3933-3941): a
// `.dm-table-wrap > .dm-scroll > table.dm`, same chrome as TabCandidates/InstitutesTable. The
// prototype's mock log entries carry a per-action icon/color (`ic`/`cl`) rendered via `.creator
// .av`; the real AuditLog model (server/src/models/AuditLog.ts) has no icon/color field, just
// action/actor/detail/at, so this renders the plain columns the task brief specifies — Action,
// Detail, Actor, When — rather than fabricating an icon mapping not backed by data.
//
// Pager is the same "simple" prev/next form as TabCandidates.

const LIMIT = 10;
const COLSPAN = 4;

export function TabAudit({ instituteId }: { instituteId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useInstituteAudit(instituteId, page, LIMIT);

  const total = data?.total ?? 0;
  const limit = data?.limit ?? LIMIT;
  const effPage = data?.page ?? page;
  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (effPage - 1) * limit;
  const shown = items.length;

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h3>Audit logs</h3>
          <div className="sub">Chronological record of activity on this institute</div>
        </div>
      </div>
      <div className="dm-table-wrap">
        <div className="dm-scroll">
          <table className="dm" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th>Action</th>
                <th>Detail</th>
                <th>Actor</th>
                <th className="r">When</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={COLSPAN}>
                    <div className="dm-empty">Loading audit log…</div>
                  </td>
                </tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={COLSPAN}>
                    <div className="dm-empty">
                      <i className="ti ti-list-details" />
                      No audit entries yet.
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && items.map((a, idx) => (
                <tr key={`${a.at}-${idx}`}>
                  <td><b>{a.action}</b></td>
                  <td>{a.detail}</td>
                  <td>{a.actor}</td>
                  <td className="r" style={{ color: 'var(--muted)' }}>{new Date(a.at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dm-pager">
          <div className="pinfo">
            {total ? <>Showing <b>{start + 1}–{start + shown}</b> of <b>{total}</b> entries</> : 'No audit entries'}
          </div>
          <div className="pctrl">
            <button className="pbtn" disabled={effPage <= 1} onClick={() => setPage(effPage - 1)}>
              <i className="ti ti-chevron-left" /> Prev
            </button>
            <button className="pbtn" disabled={effPage >= pages} onClick={() => setPage(effPage + 1)}>
              Next <i className="ti ti-chevron-right" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
