import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerBoard, useMoveStage } from './hooks/useEmployerBoard.js';
import { KANBAN_ALL, KANBAN_ORDER, KANBAN_TERMINAL, type BoardCard, type BoardStage } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

// Ported per the Slice 8 (kanban) task brief. Renders inside EmployerShell's ".page active"
// content area -- intentionally does NOT re-wrap in ".employer-app" (only ".page-wrap"), same
// convention as EmployerCandidates.tsx/EmployerInterviews.tsx. Reuses the ported .kanban-board/
// .kanban-col/.kcol-head/.kdot/.kt/.kn/.kcol-body/.kcol-empty/.kcard/.kc-top/.kc-name/.kc-id/
// .kc-score/.kc-foot/.kbtn CSS (employer.css).
//
// Move buttons only (no drag-and-drop): Advance/Back walk KANBAN_ORDER, Reject jumps straight
// to the terminal 'Rejected' column, and terminal cards (Rejected/Withdrawn) get a single
// Restore button back to 'Recommended'. Advance/Back/Reject carry aria-labels so tests (and
// screen readers) can find them by accessible name.

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }
const DOT: Record<string, string> = {
  Recommended: '#8a90a6', Shortlisted: '#2f4fe0', 'Candidate Confirmed': '#17a673', Scheduled: '#2f4fe0',
  L1: '#d98a12', L2: '#d98a12', L3: '#d98a12', HR: '#7c3aed', 'Offer Sent': '#17a673', 'Offer Accepted': '#12805a',
  Joined: '#0f7a52', Rejected: '#e0463c', Withdrawn: '#8a90a6',
};

export function EmployerKanban() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const board = useEmployerBoard(driveId);
  const move = useMoveStage(driveId);
  const items = board.data?.items ?? [];
  const byStage = (st: BoardStage) => items.filter((c) => c.stage === st);

  const card = (c: BoardCard) => {
    const idx = KANBAN_ORDER.indexOf(c.stage);
    const terminal = KANBAN_TERMINAL.includes(c.stage);
    return (
      <div className="kcard" key={c.jobseekerId}>
        <div className="kc-top">
          <div style={{ minWidth: 0 }}>
            <div className="kc-name">{c.revealed ? c.revealed.name : c.code}</div>
            <div className="kc-id">{c.revealed ? `${c.code} · revealed` : 'identity hidden'}</div>
          </div>
          <span className="kc-score" style={{ background: c.matchScore >= 86 ? 'var(--green)' : 'var(--indigo)' }}>{c.matchScore}</span>
        </div>
        <div className="kc-foot">
          {terminal ? (
            <button type="button" className="kbtn restore" disabled={move.isPending} onClick={() => move.mutate({ jobseekerId: c.jobseekerId, stage: 'Recommended' })}>Restore</button>
          ) : (
            <>
              <button type="button" className="kbtn" aria-label="Back" disabled={move.isPending || idx <= 0} onClick={() => move.mutate({ jobseekerId: c.jobseekerId, stage: KANBAN_ORDER[idx - 1] })}>◀</button>
              <button type="button" className="kbtn" aria-label="Advance" disabled={move.isPending || idx >= KANBAN_ORDER.length - 1} onClick={() => move.mutate({ jobseekerId: c.jobseekerId, stage: KANBAN_ORDER[idx + 1] })}>▶</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="kbtn rej" aria-label="Reject" disabled={move.isPending} onClick={() => move.mutate({ jobseekerId: c.jobseekerId, stage: 'Rejected' })}>✕</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/candidates`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to jobseekers
      </button>
      <div className="card">
        <h2>Hiring pipeline</h2>
        <p className="hint">
          Private to your team. Identities appear once a candidate consents.{' '}
          <button type="button" className="btn btn-ghost" onClick={() => navigate(`/employer/drives/${driveId}/interviews`)}>Interviews</button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(`/employer/drives/${driveId}/offers`)}>Offer management</button>
        </p>
      </div>
      {move.isError && <p className="otp-err" role="alert">{errMsg(move.error)}</p>}
      {board.isLoading ? <p className="hint">Loading…</p>
        : board.isError ? <p className="hint">{errMsg(board.error)}</p>
        : items.length === 0 ? <p className="cand-empty hint">No jobseekers in the pipeline yet.</p>
        : (
          <div className="kanban-board">
            {KANBAN_ALL.map((st) => {
              const cards = byStage(st);
              return (
                <div className="kanban-col" key={st}>
                  <div className="kcol-head"><span className="kdot" style={{ background: DOT[st] }} /><span className="kt">{st}</span><span className="kn">{cards.length}</span></div>
                  <div className="kcol-body">{cards.length ? cards.map(card) : <div className="kcol-empty">—</div>}</div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
