import { useState } from 'react';
import { useInstituteCandidates } from '../hooks/useInstituteCandidates.js';

// Ported from matchday-admin-app_23.html's renderIdCandidates() (lines ~3891-3905): a
// `.dm-table-wrap > .dm-scroll > table.dm` with a `.dm-pager` below it — the same table chrome
// InstitutesTable.tsx/index.tsx already use for the main institutes grid (there is no separate
// `.lb` table variant for this; `.lb` in theme.css is an unrelated leaderboard-widget table used
// only on the dashboard, lines 1310/1323).
//
// Column set differs from the prototype's mock genCandidates() (Candidate/Branch/Grad
// Year/Copilot Score/Stage): the real API (institutes.service.ts#listCandidates, backed by the
// Jobseeker model) has no "Copilot Score" field, but does have cgpa/source/profileCompleted, so
// this renders the columns the task brief specifies — Name, Branch, Grad Year, CGPA, Source,
// Stage, Profile — all bound to CandidateRow.
//
// Pager is deliberately the "simple" prev/next form (no page-number buttons) per the task brief,
// unlike InstitutesPage's full numbered pager.

const LIMIT = 10;
const COLSPAN = 7;

export function TabCandidates({ instituteId }: { instituteId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useInstituteCandidates(instituteId, page, LIMIT);

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
          <h3>Jobseekers</h3>
          <div className="sub">Jobseekers uploaded by this institute</div>
        </div>
      </div>
      <div className="dm-table-wrap">
        <div className="dm-scroll">
          <table className="dm" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Branch</th>
                <th className="r">Grad Year</th>
                <th className="r">CGPA</th>
                <th>Source</th>
                <th>Stage</th>
                <th>Profile</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={COLSPAN}>
                    <div className="dm-empty">Loading jobseekers…</div>
                  </td>
                </tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={COLSPAN}>
                    <div className="dm-empty">
                      <i className="ti ti-users" />
                      No jobseekers uploaded yet.
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && items.map((c) => (
                <tr key={c.id}>
                  <td><div className="dm-name"><b>{c.name}</b></div></td>
                  <td>{c.branch}</td>
                  <td className="r mono">{c.gradYear}</td>
                  <td className="r mono">{c.cgpa}</td>
                  <td>{c.source}</td>
                  <td><span className="cand-stage">{c.stage}</span></td>
                  <td>
                    <span className={`badge-st ${c.profileCompleted ? 'st-active' : 'st-pending'}`}>
                      <i className="ti ti-circle-filled" /> {c.profileCompleted ? 'Complete' : 'Incomplete'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dm-pager">
          <div className="pinfo">
            {total ? <>Showing <b>{start + 1}–{start + shown}</b> of <b>{total}</b> jobseekers</> : 'No jobseekers'}
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
