import { useJobseekerMutations } from './hooks/useJobseekerMutations.js';

// Confirmation modal for the kebab menu's "Reset evaluation" action (JobseekersTable.tsx).
// Mirrors ActionModal.tsx's modal-scrim/modal-h/modal-b/modal-f layout and its
// mutation.mutate(..., { onSuccess: onClose }) pattern. The success toast itself comes from the
// shared MutationCache (see resetEvaluationOne's meta.successMessage in useJobseekerMutations.ts),
// not a manual toast() call here — same as every other jobseeker mutation.
export interface ResetEvaluationModalProps {
  jobseekerId: string;
  onClose: () => void;
}

export function ResetEvaluationModal({ jobseekerId, onClose }: ResetEvaluationModalProps) {
  const { resetEvaluationOne } = useJobseekerMutations();

  function handleConfirm() {
    resetEvaluationOne.mutate(jobseekerId, { onSuccess: onClose });
  }

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="resetEvalTitle">
        <div className="modal-h">
          <div>
            <h3 id="resetEvalTitle">Reset Evaluation?</h3>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          <div className="fld full">
            <p>Are you sure you want to reset this candidate's evaluation? The candidate will need to complete the evaluation again.</p>
          </div>
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" disabled={resetEvaluationOne.isPending} onClick={onClose}>Cancel</button>
          <button className="btn btn-danger btn-lg" disabled={resetEvaluationOne.isPending} onClick={handleConfirm}>
            <i className="ti ti-refresh" /> {resetEvaluationOne.isPending ? 'Resetting…' : 'Reset Evaluation'}
          </button>
        </div>
      </div>
    </div>
  );
}
