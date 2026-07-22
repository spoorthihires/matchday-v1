import { type ReactNode, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.js';
import { useEmployerPortal } from './hooks/useEmployerPortal.js';
import { ThemeToggle } from '../../theme/ThemeToggle.js';
import './employerBase.js';

// Ported from the prototype Matchday_Employer.html lines ~2630-2704 (view-app's sidebar +
// topbar chrome). This is the authenticated employer app frame: it renders the sidebar
// navigation + topbar, and the page content (children, or <Outlet/> if used with nested
// routes) in the content area. Task 8's dashboard (and every later slice's page) renders
// inside this shell.

interface NavItem {
  slug: string;
  label: string;
  path: string;
  icon: ReactNode;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Main',
    items: [
      {
        slug: 'dashboard',
        label: 'Dashboard',
        path: '/employer/dashboard',
        icon: (
          <svg className="ic" viewBox="0 0 24 24"><path d="M3 12l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></svg>
        ),
      },
      {
        slug: 'drives',
        label: 'Available Drives',
        path: '/employer/drives',
        icon: (
          <svg className="ic" viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Hiring',
    items: [
      {
        slug: 'registrations',
        label: 'Registrations',
        path: '/employer/registrations',
        icon: (
          <svg className="ic" viewBox="0 0 24 24">
            <path d="M9 5h6M9 5a2 2 0 00-2 2v0a2 2 0 002 2h6a2 2 0 002-2v0a2 2 0 00-2-2M7 7H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
          </svg>
        ),
      },
      {
        slug: 'candidates',
        label: 'Candidates',
        path: '/employer/drives',
        icon: (
          <svg className="ic" viewBox="0 0 24 24">
            <circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0" /><path d="M16 6a3 3 0 010 6M21 20a6 6 0 00-4-5.6" />
          </svg>
        ),
      },
      {
        slug: 'interviews',
        label: 'Interviews',
        // Interviews are viewed per-drive (/employer/drives/:id/interviews), so — like
        // Candidates — this nav item lands on the drive list; open a drive to reach it.
        path: '/employer/drives',
        icon: (
          <svg className="ic" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /><path d="M9 15l2 2 4-4" />
          </svg>
        ),
      },
      {
        slug: 'kanban',
        label: 'Kanban',
        // The pipeline board is per-drive (/employer/drives/:id/board); like Candidates,
        // this nav item lands on the drive list, and the drive's Candidates page links to its board.
        path: '/employer/drives',
        icon: (
          <svg className="ic" viewBox="0 0 24 24">
            <rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="14" rx="1" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Insights',
    items: [
      {
        slug: 'reports',
        label: 'Reports',
        path: '/employer/reports',
        icon: (
          <svg className="ic" viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M7 14l3-4 3 3 5-6" /></svg>
        ),
      },
    ],
  },
];

const SETTINGS_ITEM: NavItem = {
  slug: 'settings',
  label: 'Settings',
  path: '/employer/team',
  icon: (
    <svg className="ic" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 01-4 0v-.1A1.6 1.6 0 008.8 19a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 010-4h.1A1.6 1.6 0 005 8.8a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 014 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z" />
    </svg>
  ),
};

// Derives the two-letter avatar initials the prototype hardcodes (e.g. "NL" for "Northwind
// Labs"): first letter of the first two whitespace-separated words, uppercased.
function initials(name: string | undefined): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export function EmployerShell({ children }: { children?: ReactNode }) {
  const { logout } = useAuth();
  const { data } = useEmployerPortal();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const profile = data?.profile;
  const companyName = profile?.name ?? '';
  const contactName = profile?.spoc ?? '';
  const notificationsUnread = data?.dashboard?.notificationsUnread ?? 0;

  function goTo(item: NavItem) {
    navigate(item.path);
    setSidebarOpen(false);
  }

  function isActive(item: NavItem) {
    // Prefix match (not just exact) so the "Available Drives" nav item stays highlighted on
    // the marketplace's nested detail route too, e.g. /employer/drives/:id (Task 3).
    return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
  }

  function onLogout() {
    setUserMenuOpen(false);
    logout();
  }

  return (
    <div className="employer-app">
      <div className="app-shell">
        {sidebarOpen && <div className="sb-backdrop" onClick={() => setSidebarOpen(false)} />}

        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sb-brand">
            <span className="logo-mark">
              <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v6l8 4 8-4V7" /></svg>
            </span>
            <span>Hiringhood<small>MatchDay</small></span>
          </div>

          <nav className="sb-nav">
            {NAV_SECTIONS.map((section) => (
              <div key={section.label}>
                <div className="sb-sec">{section.label}</div>
                {section.items.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    className={`nav-item${isActive(item) ? ' active' : ''}`}
                    data-page={item.slug}
                    onClick={() => goTo(item)}
                  >
                    {item.icon} {item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="sb-foot">
            <button
              type="button"
              className={`nav-item${isActive(SETTINGS_ITEM) ? ' active' : ''}`}
              data-page="settings"
              style={{ marginBottom: 6 }}
              onClick={() => goTo(SETTINGS_ITEM)}
            >
              {SETTINGS_ITEM.icon} {SETTINGS_ITEM.label}
            </button>
            <div className="sb-user" onClick={() => goTo(SETTINGS_ITEM)}>
              <span className="av">{initials(contactName) || initials(companyName)}</span>
              <div>
                <div className="nm">{contactName}</div>
                <div className="rl">{companyName}</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="app-main">
          <header className="topbar">
            <button className="tb-burger" aria-label="Menu" onClick={() => setSidebarOpen((v) => !v)}>
              <svg className="ic ic-lg" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="tb-search">
              <svg className="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              <input placeholder="Search drives, candidates, IDs…" aria-label="Search" />
            </div>
            <div className="tb-actions">
              <button
                type="button"
                className="icon-btn"
                aria-label="Help"
                onClick={() => navigate('/employer/support')}
              >
                <svg className="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 013.9-1.6c1.1.7 1.1 2 .1 2.8-.7.5-1.5.9-1.5 1.8" /><path d="M12 17h.01" /></svg>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Notifications"
                onClick={() => navigate('/employer/notifications')}
              >
                <svg className="ic" viewBox="0 0 24 24"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>
                {notificationsUnread > 0 && <span className="ndot" />}
              </button>
              <ThemeToggle variant="svg" />
              <div
                className="tb-user"
                role="button"
                tabIndex={0}
                aria-label="Account menu"
                aria-haspopup="true"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((v) => !v)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUserMenuOpen((v) => !v); } }}
              >
                <span className="av">{initials(contactName) || initials(companyName)}</span>
                <div className="co">{companyName}<small>{contactName}</small></div>
                <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
                <div
                  className={`user-dd${userMenuOpen ? ' open' : ''}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button type="button" onClick={() => { goTo(SETTINGS_ITEM); setUserMenuOpen(false); }}>
                    Company profile
                  </button>
                  <button type="button" onClick={() => { goTo(SETTINGS_ITEM); setUserMenuOpen(false); }}>
                    Settings
                  </button>
                  <div className="sep" />
                  <button type="button" className="danger" onClick={onLogout}>
                    Log out
                  </button>
                </div>
              </div>
            </div>
          </header>

          <div className="page active">
            {children ?? <Outlet />}
          </div>
        </div>
      </div>
    </div>
  );
}
