import { useState } from 'react';
import type { ConflictRow } from './mockData.js';

// UI-only mock: pick the winning claimant for an ownership conflict. There is no backing API —
// `onResolve` marks the row Resolved in the in-memory list held by the parent tab.

export interface ResolveConflictModalProps {
  conflict: ConflictRow;
  onClose: () => void;
  onResolve: (winningOwner: string) => void;
}

export function ResolveConflictModal({ conflict, onClose, onResolve }: ResolveConflictModalProps) {
  const [winner, setWinner] = useState(conflict.claimantA);

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rcmTitle">
        <div className="modal-h">
          <div>
            <h3 id="rcmTitle">Resolve Conflict</h3>
            <p>{conflict.type}: <b>{conflict.entity}</b></p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          <div className="fld full">
            <label>Keep ownership with</label>
            <div className="pick">
              <button type="button" className={`opt${winner === conflict.claimantA ? ' on' : ''}`} onClick={() => setWinner(conflict.claimantA)}>{conflict.claimantA}</button>
              <button type="button" className={`opt${winner === conflict.claimantB ? ' on' : ''}`} onClick={() => setWinner(conflict.claimantB)}>{conflict.claimantB}</button>
            </div>
          </div>
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" onClick={() => onResolve(winner)}>
            <i className="ti ti-circle-check" /> Resolve
          </button>
        </div>
      </div>
    </div>
  );
}
