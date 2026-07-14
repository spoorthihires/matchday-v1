import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar.js';
import { Topbar } from './Topbar.js';

// Ported from matchday-admin-app_23.html lines ~1091-1129.
// `.sidebar` is position:fixed and `.main` uses margin-left: var(--sidebar) in theme.css,
// so these render as top-level siblings (no extra wrapper div — the prototype has none,
// and none is needed for the CSS to apply).
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
    <>
      <Sidebar />
      <div className="scrim" id="scrim" />
      <div className="main">
        <Topbar crumb={crumb} title={title} />
        {children}
      </div>
    </>
  );
}
