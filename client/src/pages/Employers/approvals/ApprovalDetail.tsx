import type { CSSProperties } from 'react';
import { ApiError } from '../../../api/client.js';
import type { Registration } from '../../../types/employers.js';
import { useRegistrationAction } from './hooks/useRegistrationAction.js';

// Ported from matchday-admin-app_23.html's renderApprDetail() (lines 3506-3539): `#apprDetail`'s
// `.ad-head` / `.ad-actions` / `.ad-body` (six `.ad-sec` sections).
//
// Same empColors/hash approach as ApprovalsList.tsx (kept as a separate local copy per this
// codebase's convention — see EmployersTable.tsx/InstitutesTable.tsx/InstituteDetail.tsx, each of
// which carries its own colorForId rather than sharing one).
const LOGO_COLORS = ['#2f4fe0', '#0aa3a3', '#7c5cff', '#f2a63b', '#0f9d58', '#d9314b'];

function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function panelInitials(name: string): string {
  return name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// theme.css only styles `.ilogo` scoped under `.inst-org .ilogo` (line 668); the prototype's
// `.ad-head` logo (line 3513) sits outside that ancestor and only overrides size/radius/font
// inline, relying on the (here-unreachable) base rule for display/color/weight. Reproducing both
// the base declarations and the prototype's size override inline keeps this rendering correctly.
const ILOGO_HEAD: CSSProperties = {
  width: 46, height: 46, borderRadius: 12, display: 'grid', placeItems: 'center',
  color: '#fff', fontWeight: 700, fontSize: 15, flexShrink: 0,
};

const STATUS_CLASS: Record<Registration['status'], string> = {
  'Pending review': 'st-pending',
  Approved: 'st-active',
  Rejected: 'st-danger',
  'Changes requested': 'st-teal',
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

export interface ApprovalDetailProps {
  registration: Registration | null;
  isLoading?: boolean;
  onReject: () => void;
  onRequestChanges: () => void;
  onMoveDrive: () => void;
  onChangeSlot: () => void;
}

// The caller mounts this with `key={registration?._id}` (ApprovalsPage.tsx) so it remounts —
// resetting the local Approve mutation's pending/error state — whenever the selected
// registration changes, rather than carrying a stale error over to the next selection.
export function ApprovalDetail({
  registration, isLoading, onReject, onRequestChanges, onMoveDrive, onChangeSlot,
}: ApprovalDetailProps) {
  const approveMutation = useRegistrationAction();

  if (!registration) {
    return (
      <div className="appr-detail">
        <div className="dm-empty" style={{ padding: 60 }}>
          <i className="ti ti-inbox" />
          {isLoading ? 'Loading…' : 'Select a registration to review.'}
        </div>
      </div>
    );
  }

  const closed = registration.status === 'Approved' || registration.status === 'Rejected';

  function handleApprove() {
    approveMutation.mutate({ id: registration!._id, payload: { action: 'approve' } });
  }

  return (
    <div className="appr-detail">
      <div className="ad-head">
        <span className="ilogo" style={{ ...ILOGO_HEAD, background: colorForId(registration._id) }}>
          {initials(registration.company)}
        </span>
        <div style={{ flex: 1 }}>
          <div className="htitle">{registration.role}</div>
          <div className="hsub">
            {registration.company} · submitted by {registration.submittedBy} · {relativeTime(registration.createdAt)}
          </div>
        </div>
        <span className={`badge-st ${STATUS_CLASS[registration.status]}`}>
          <i className="ti ti-circle-filled" /> {registration.status}
        </span>
      </div>

      <div className="ad-actions">
        <button className="btn btn-success" disabled={closed || approveMutation.isPending} onClick={handleApprove}>
          <i className="ti ti-circle-check" /> Approve
        </button>
        <button className="btn btn-danger" disabled={closed} onClick={onReject}>
          <i className="ti ti-circle-x" /> Reject
        </button>
        <button className="btn btn-ghost" disabled={closed} onClick={onRequestChanges}>
          <i className="ti ti-message-dots" /> Request Changes
        </button>
        <div className="grow" style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={onMoveDrive}>
          <i className="ti ti-arrows-exchange" /> Move Drive
        </button>
        <button className="btn btn-ghost" onClick={onChangeSlot}>
          <i className="ti ti-calendar-clock" /> Change Slot
        </button>
      </div>

      {approveMutation.isError && (
        <div style={{ padding: '10px 20px', color: 'var(--danger)', fontSize: 12.5 }}>
          {mutationErrorMessage(approveMutation.error)}
        </div>
      )}

      <div className="ad-body">
        <div className="ad-sec">
          <h4>Company &amp; Drive</h4>
          <div className="ad-grid">
            <div className="ad-f"><label>Company</label><b>{registration.company}</b></div>
            <div className="ad-f"><label>Drive</label><b>{registration.driveName}</b></div>
            <div className="ad-f"><label>Role</label><b>{registration.role}</b></div>
          </div>
        </div>

        <div className="ad-sec">
          <h4>Requirement</h4>
          <div className="ad-grid">
            <div className="ad-f"><label>Openings</label><b>{registration.openings}</b></div>
            <div className="ad-f"><label>CTC range</label><b>{registration.ctcRange}</b></div>
            <div className="ad-f"><label>Slot</label><b>{registration.slot}</b></div>
          </div>
          <div className="ad-f" style={{ marginTop: 14 }}>
            <label>Skills required</label>
            <div className="skillchips">
              {registration.skills.map((s) => <span key={s}>{s}</span>)}
            </div>
          </div>
        </div>

        <div className="ad-sec">
          <h4>Job Description</h4>
          <div className="jd-box">{registration.jd}</div>
        </div>

        <div className="ad-sec">
          <h4>Interview Panel</h4>
          {registration.panel.map((p, i) => (
            <div className="panelist" key={`${p.name}-${i}`}>
              <span className="pav">{panelInitials(p.name)}</span>
              <div><b>{p.name}</b><span>{p.role}</span></div>
            </div>
          ))}
        </div>

        <div className="ad-sec">
          <h4>Approval activity</h4>
          {registration.activity.map((a, i) => (
            <div className="adlog" key={i}>
              <span className="dot" />
              <div className="lg"><b>{a.action}</b><span>{a.by} · {relativeTime(a.at)}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
