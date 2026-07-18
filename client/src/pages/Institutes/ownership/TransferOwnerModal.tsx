import { useState } from 'react';
import { OWNER_POOL } from './mockData.js';

// UI-only mock: reuses the app's modal-scrim/modal markup (see InstituteModal.tsx) to transfer
// ownership of a candidate or institute to a different SPOC/recruiter. There is no backing API —
// `onTransfer` updates the in-memory row list held by the parent tab.

export interface TransferOwnerModalProps {
  title: string;
  entityLabel: string;
  entityName: string;
  currentOwner: string;
  onClose: () => void;
  onTransfer: (newOwner: string) => void;
}

export function TransferOwnerModal({
  title, entityLabel, entityName, currentOwner, onClose, onTransfer,
}: TransferOwnerModalProps) {
  const candidates = OWNER_POOL.filter((o) => o !== currentOwner);
  const [newOwner, setNewOwner] = useState(candidates[0] ?? '');
  const [note, setNote] = useState('');

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tomTitle">
        <div className="modal-h">
          <div>
            <h3 id="tomTitle">{title}</h3>
            <p>{entityLabel}: <b>{entityName}</b></p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          <div className="fld full">
            <label>Current owner</label>
            <input value={currentOwner} disabled />
          </div>
          <div className="fld full">
            <label htmlFor="tomNewOwner">Transfer to</label>
            <select id="tomNewOwner" value={newOwner} onChange={(e) => setNewOwner(e.target.value)}>
              {candidates.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="fld full">
            <label htmlFor="tomNote">Note (optional)</label>
            <input id="tomNote" placeholder="Reason for transfer…" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" disabled={!newOwner} onClick={() => onTransfer(newOwner)}>
            <i className="ti ti-transfer" /> Transfer
          </button>
        </div>
      </div>
    </div>
  );
}
