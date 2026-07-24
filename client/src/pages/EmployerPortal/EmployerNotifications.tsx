import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEmployerNotifications, useMarkNotificationsRead, formatRelativeTime } from './hooks/useEmployerNotifications.js';
import type { EmployerNotificationCategory } from '../../types/employer.js';
import './employerBase.js';

const CATS: { key: EmployerNotificationCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'registration', label: 'Registrations' },
  { key: 'candidate', label: 'Jobseekers' },
  { key: 'slot', label: 'Slots' },
];
const TINT: Record<EmployerNotificationCategory, string> = { registration: 'ni-ok', candidate: 'ni-cand', slot: 'ni-warn' };
const CAT_LABEL: Record<EmployerNotificationCategory, string> = { registration: 'Registration', candidate: 'Jobseeker', slot: 'Slot' };

export function EmployerNotifications() {
  const [cat, setCat] = useState<EmployerNotificationCategory | 'all'>('all');
  const q = useEmployerNotifications();
  const markRead = useMarkNotificationsRead();
  const items = q.data?.items ?? [];
  const shown = cat === 'all' ? items : items.filter((n) => n.category === cat);
  const unread = q.data?.unreadCount ?? 0;

  return (
    <div className="page-wrap">
      <div className="dash-greet" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>Notification center</h2>
          <p>All your MatchDay updates in one place.</p>
        </div>
        <button type="button" className="btn btn-ghost" disabled={unread === 0 || markRead.isPending} onClick={() => markRead.mutate()}>
          Mark all as read
        </button>
      </div>

      <div className="cand-summary" style={{ marginBottom: 16 }}>
        {CATS.map((c) => (
          <button type="button" key={c.key} className={`cand-sumchip${cat === c.key ? ' on' : ''}`} onClick={() => setCat(c.key)}>{c.label}</button>
        ))}
      </div>

      {q.isLoading ? <p className="hint">Loading…</p>
        : q.isError ? <p className="hint">{q.error instanceof Error ? q.error.message : 'Failed to load notifications'}</p>
        : shown.length === 0 ? <div className="notif-list"><div className="notif-empty">No notifications{cat !== 'all' ? ' in this category' : ''}.</div></div>
        : (
          <div className="notif-list">
            {shown.map((n) => (
              <div className={`nc-item${n.read ? '' : ' unread'}`} key={n.id}>
                <span className={`nc-ic ${TINT[n.category]}`}>
                  <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>
                </span>
                <div className="nc-main">
                  <div className="nc-cat">{CAT_LABEL[n.category]}</div>
                  <div className="nc-title">{n.title}</div>
                  <div className="nc-body">{n.body}</div>
                  <div className="nc-meta"><span className="nc-time">{formatRelativeTime(n.at)}</span></div>
                </div>
                <div className="nc-right">
                  {!n.read && <span className="nc-unread-dot" />}
                  <Link to={n.link} className="nc-act">View →</Link>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
