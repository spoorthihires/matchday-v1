import { useParams } from 'react-router-dom';
import { AppShell } from './AppShell.js';

function titleize(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function ComingSoon() {
  const { slug } = useParams();
  const name = slug ? titleize(slug) : 'This module';

  return (
    <AppShell crumb="Coming soon" title={name}>
      <div className="content">
        <div className="card">
          <div className="card-h">
            <h3>{name}</h3>
          </div>
          <p style={{ padding: '20px', color: 'var(--muted)' }}>
            This module is not part of the current build yet. Command Center is live — pick it
            from the sidebar.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
