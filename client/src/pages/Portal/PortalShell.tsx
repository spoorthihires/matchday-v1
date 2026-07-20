import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext.js';

export function PortalShell({ name, children }: { name: string; children: ReactNode }) {
  const { logout } = useAuth();
  return (
    <div className="portal">
      <header className="portal-top">
        <div className="brand">
          <img src="/logo.png" alt="MatchDay" className="brand-logo" />
        </div>
        <div className="grow" />
        <span className="portal-user"><i className="ti ti-user-circle" /> {name}</span>
        <button className="btn" onClick={logout}><i className="ti ti-logout" /> Sign out</button>
      </header>
      <main className="portal-body">{children}</main>
    </div>
  );
}
