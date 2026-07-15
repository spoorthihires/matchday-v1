import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../../components/AppShell.js';
import type { Registration } from '../../../types/employers.js';
import { ActionModal, type ActionModalKind } from './ActionModal.js';
import { ApprovalDetail } from './ApprovalDetail.js';
import { ApprovalsList } from './ApprovalsList.js';
import { useRegistrations } from './hooks/useRegistrations.js';

type ModalState = { kind: ActionModalKind; registration: Registration } | null;

// Ported from matchday-admin-app_23.html lines 1959-1968 (#page-emp-approvals) and the
// renderApprovals()/renderApprDetail() handlers around lines 3497-3541.
//
// Self-wraps in AppShell (mirroring EmployersPage/InstituteDetail) — App.tsx must mount this
// directly under ProtectedRoute with no outer AppShell of its own.
export function ApprovalsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useRegistrations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  const items = data?.items ?? [];
  // Selection defaults to the first item (per the task brief) and re-resolves against the
  // latest fetched list by id, so a status update to the currently-selected registration (e.g.
  // after Approve) is reflected without losing the selection.
  const selected = items.find((r) => r._id === selectedId) ?? items[0] ?? null;

  function openModal(kind: ActionModalKind) {
    if (selected) setModal({ kind, registration: selected });
  }

  return (
    <AppShell crumb="Demand · Employers" title="Registration Approvals">
      <div className="content">
        <button className="backlink" onClick={() => navigate('/employers')}>
          <i className="ti ti-arrow-left" /> Back to Employers
        </button>

        <div className="section-title">
          Registration approval queue <span className="rule" />
          <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--faint)' }}>
            {data ? `${data.counts.pending} awaiting review · ${data.counts.total} total` : ''}
          </span>
        </div>

        {isError && (
          <div className="card">
            <p style={{ padding: 20, color: 'var(--danger)' }}>
              Failed to load registrations: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        )}

        <div className="appr-wrap">
          <ApprovalsList
            items={items}
            selectedId={selected?._id ?? null}
            onSelect={setSelectedId}
            isLoading={isLoading}
          />
          <ApprovalDetail
            key={selected?._id ?? 'none'}
            registration={selected}
            isLoading={isLoading}
            onReject={() => openModal('reject')}
            onRequestChanges={() => openModal('request-changes')}
            onMoveDrive={() => openModal('move-drive')}
            onChangeSlot={() => openModal('change-slot')}
          />
        </div>

        {modal && (
          <ActionModal
            kind={modal.kind}
            registration={modal.registration}
            onClose={() => setModal(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
