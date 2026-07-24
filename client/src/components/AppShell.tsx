import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar.js';
import { Topbar } from './Topbar.js';

// Ported from matchday-admin-app_23.html lines ~1091-1129.
// `.sidebar` is position:fixed and `.main` uses margin-left: var(--sidebar) in theme.css,
// so wrapping them in a plain `.admin-app` div (added for V1's accent-token scope root)
// does not affect that layout — `.admin-app` itself carries no positioning/layout rules.
export function AppShell({
  crumb,
  title,
  children,
}: {
  crumb: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-app">
      <Sidebar />
      <div className="scrim" id="scrim" />
      <div className="main">
        <Topbar crumb={crumb} title={title} />
        {children}
      </div>
    </div>
  );
}
