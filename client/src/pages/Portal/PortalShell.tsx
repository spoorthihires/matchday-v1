import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.js';
import { ThemeToggle } from '../../theme/ThemeToggle.js';
import { BrandLogo } from '../../theme/BrandLogo.js';

export function PortalShell({ name, children }: { name: string; children: ReactNode }) {
  const { logout } = useAuth();
  return (
    <div className="portal">
      <header className="portal-top">
        <div className="brand">
          <BrandLogo className="brand-logo" />
        </div>
        <div className="grow" />
        <span className="portal-user"><i className="ti ti-user-circle" /> {name}</span>
        <ThemeToggle />
        <Link className="btn" to="/portal/account"><i className="ti ti-user-cog" /> Account</Link>
        <button className="btn" onClick={logout}><i className="ti ti-logout" /> Sign out</button>
      </header>
      <main className="portal-body">{children}</main>
    </div>
  );
}
