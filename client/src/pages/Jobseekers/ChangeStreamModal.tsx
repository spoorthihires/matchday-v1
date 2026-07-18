import { useState } from 'react';
import { MODAL_STREAM_OPTIONS } from './constants.js';
import { useJobseekerMutations } from './hooks/useJobseekerMutations.js';

// Modal for the kebab menu's "Change stream" action (JobseekersTable.tsx). Mirrors
// ResetEvaluationModal.tsx's modal-scrim/modal-h/modal-b/modal-f layout and
// mutation.mutate(..., { onSuccess: onClose }) pattern. Row-level (not BulkBar-driven), so the
// "selected" count is always the single candidate the kebab menu was opened on.
//
// The dropdown options are MODAL_STREAM_OPTIONS — the same "design update" stream set the
// Add/Edit Candidate modal's Stream select already uses (see constants.ts), which is distinct
// from the table's STREAM_OPTIONS (CSE/IT/ECE/EEE/MECH) chip values. Pre-selecting `currentStream`
// against that list carries the same mismatch JobseekerModal already has when a candidate's stored
// stream isn't one of the five design-update options — not something to special-case here.
export interface ChangeStreamModalProps {
  jobseekerId: string;
  currentStream: string;
  onClose: () => void;
}

export function ChangeStreamModal({ jobseekerId, currentStream, onClose }: ChangeStreamModalProps) {
  const { update } = useJobseekerMutations();
  const [stream, setStream] = useState(currentStream);

  function handleConfirm() {
    update.mutate({ id: jobseekerId, body: { branch: stream } }, { onSuccess: onClose });
  }

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="changeStreamTitle">
        <div className="modal-h">
          <div>
            <h3 id="changeStreamTitle">Change Stream</h3>
            <p>1 candidate(s) selected</p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          <div className="fld full">
            <label htmlFor="changeStreamSelect">Move 1 candidate(s) to stream</label>
            <select id="changeStreamSelect" value={stream} onChange={(e) => setStream(e.target.value)}>
              {MODAL_STREAM_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" disabled={update.isPending} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" disabled={update.isPending} onClick={handleConfirm}>
            <i className="ti ti-git-branch" /> {update.isPending ? 'Moving…' : 'Change Stream'}
          </button>
        </div>
      </div>
    </div>
  );
}
