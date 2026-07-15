import type { CSSProperties } from 'react';
import type { Registration } from '../../../types/employers.js';

// Ported from matchday-admin-app_23.html's renderApprovals() (lines 3497-3505): the `#apprList`
// column of `.appr-item` cards.
//
// empColors from the prototype (line 3363, reused for the approvals cards at line 3502) —
// cycled by a stable hash of the (string) id since real ids are Mongo ObjectIds rather than the
// prototype's small integers (same approach as EmployersTable.tsx/InstitutesTable.tsx).
const LOGO_COLORS = ['#2f4fe0', '#0aa3a3', '#7c5cff', '#f2a63b', '#0f9d58', '#d9314b'];

function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// theme.css only styles `.ilogo` scoped under `.inst-org .ilogo` (line 668) — the prototype's
// `.ai-top .ilogo` (line 3502) has no such ancestor, so a bare `.ilogo` class renders unstyled
// here. Reproducing the scoped rule's declarations inline keeps the faithful `.ilogo` class name
// (for anyone grepping theme.css against this markup) while actually rendering correctly.
const ILOGO_BASE: CSSProperties = {
  width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center',
  color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0,
};

// apprStCls from the prototype (line 3499).
const STATUS_CLASS: Record<Registration['status'], string> = {
  'Pending review': 'st-pending',
  Approved: 'st-active',
  Rejected: 'st-danger',
  'Changes requested': 'st-teal',
};

// Simple relative-time helper per the task brief (createdAt is a real ISO timestamp here,
// unlike the prototype's pre-baked "2 hours ago" strings).
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export interface ApprovalsListProps {
  items: Registration[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
}

export function ApprovalsList({ items, selectedId, onSelect, isLoading }: ApprovalsListProps) {
  if (isLoading) {
    return <div className="appr-list"><div className="dm-empty">Loading registrations…</div></div>;
  }
  if (items.length === 0) {
    return (
      <div className="appr-list">
        <div className="dm-empty"><i className="ti ti-inbox-off" />No registrations to review.</div>
      </div>
    );
  }
  return (
    <div className="appr-list">
      {items.map((r) => (
        <div
          key={r._id}
          className={`appr-item${r._id === selectedId ? ' on' : ''}`}
          onClick={() => onSelect(r._id)}
        >
          <div className="ai-top">
            <span className="ilogo" style={{ ...ILOGO_BASE, background: colorForId(r._id) }}>
              {initials(r.company)}
            </span>
            <div><b>{r.company}</b><span className="role">{r.role}</span></div>
          </div>
          <div className="ai-meta">
            <span className={`badge-st ${STATUS_CLASS[r.status]}`}>
              <i className="ti ti-circle-filled" /> {r.status}
            </span>
            <span className="when">{relativeTime(r.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
