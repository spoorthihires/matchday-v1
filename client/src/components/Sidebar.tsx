import { Fragment } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { BrandLogo } from '../theme/BrandLogo.js';

interface NavItem {
  label: string;
  icon: string;
  to: string;
  count?: number;
  group?: string;
}

// Ported from matchday-admin-app_23.html lines ~1093-1109.
const NAV: NavItem[] = [
  { label: 'Command Center', icon: 'ti-layout-dashboard', to: '/' },
  { label: 'Drives', icon: 'ti-calendar-event', to: '/drives', count: 12 },
  { label: 'Institutes', icon: 'ti-building-community', to: '/institutes', count: 21, group: 'Supply' },
  { label: 'Jobseekers', icon: 'ti-users', to: '/jobseekers' },
  { label: 'Evaluations', icon: 'ti-clipboard-check', to: '/evaluations' },
  { label: 'Templates', icon: 'ti-template', to: '/templates' },
  { label: 'Streams', icon: 'ti-git-branch', to: '/streams' },
  { label: 'Employers', icon: 'ti-briefcase', to: '/employers', count: 48, group: 'Demand' },
  { label: 'Recruiters', icon: 'ti-user-search', to: '/coming-soon/recruiters' },
  { label: 'Slots', icon: 'ti-calendar-time', to: '/slots' },
  { label: 'Reports', icon: 'ti-chart-bar', to: '/coming-soon/reports', group: 'Operate' },
  { label: 'Audit Trail', icon: 'ti-history', to: '/coming-soon/audit' },
  { label: 'Settings', icon: 'ti-settings', to: '/coming-soon/settings' },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const name = user?.name ?? 'Platform Admin';

  function onUserKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      logout();
    }
  }

  return (
    <aside className="sidebar" id="sidebar">
      <div className="sb-brand">
        <BrandLogo className="brand-logo" />
      </div>
      <nav className="sb-scroll">
        {NAV.map((item) => (
          <Fragment key={item.to}>
            {item.group && <div className="nav-label">{item.group}</div>}
            <NavLink
              to={item.to}
              end
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <i className={`ti ${item.icon}`} /> {item.label}
              {item.count != null && <span className="count">{item.count}</span>}
            </NavLink>
          </Fragment>
        ))}
      </nav>
      <div className="sb-foot">
        <div
          className="sb-user"
          id="userMenu"
          title="Sign out"
          role="button"
          tabIndex={0}
          onClick={logout}
          onKeyDown={onUserKeyDown}
        >
          <div className="avatar" id="avatarInitials">{initials(name)}</div>
          <div className="who"><b id="userName">{name}</b><span>Platform Admin</span></div>
          <i className="ti ti-logout" style={{ marginLeft: 'auto', color: 'var(--muted)' }} />
        </div>
      </div>
    </aside>
  );
}
