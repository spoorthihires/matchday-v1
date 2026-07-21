import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerShell } from '../pages/EmployerPortal/EmployerShell.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
function mockAggregate(notificationsUnread: number) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ profile: { id: 'e1', name: 'Acme', email: 'e@c.com', industry: 'Tech', size: '', status: 'Active', spoc: 'Jane', website: '' }, dashboard: { kpis: { activeDrives: 0, upcomingInterviews: 0, totalSlots: 0 }, calendar: [], registrations: [], shortlist: [], notifications: [], notificationsUnread } }),
  })));
}
function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/dashboard']}>
        <AuthProvider><EmployerShell><div>content</div></EmployerShell></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerShell notification bell', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('shows the bell; badge appears when unread > 0', async () => {
    seedAuth(); mockAggregate(3);
    const { container } = renderShell();
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.icon-btn .ndot')).not.toBeNull());
  });

  it('hides the badge when unread = 0', async () => {
    seedAuth(); mockAggregate(0);
    const { container } = renderShell();
    await waitFor(() => expect(screen.getByLabelText('Notifications')).toBeInTheDocument());
    expect(container.querySelector('.icon-btn .ndot')).toBeNull();
  });
});
