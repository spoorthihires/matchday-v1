import { ThemeToggle } from '../theme/ThemeToggle.js';

// Ported from matchday-admin-app_23.html lines ~1122-1129.
// The search box and notification/help/menu icon buttons are static (non-functional),
// matching the prototype's un-wired markup.
export function Topbar({ crumb, title }: { crumb: string; title: string }) {
  return (
    <header className="top">
      <button className="icon-btn menu-toggle" aria-label="Open menu">
        <i className="ti ti-menu-2" />
      </button>
      <div>
        <div className="crumb">{crumb}</div>
        <h1>{title}</h1>
      </div>
      <div className="grow" />
      <div className="search">
        <i className="ti ti-search" />
        <input placeholder="Search drives, employers, jobseekers…" aria-label="Search" />
      </div>
      <ThemeToggle />
      <button className="icon-btn" aria-label="Notifications">
        <i className="ti ti-bell" />
        <span className="dot" />
      </button>
      <button className="icon-btn" aria-label="Help">
        <i className="ti ti-help-circle" />
      </button>
    </header>
  );
}
