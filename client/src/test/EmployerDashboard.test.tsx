import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerDashboard } from '../pages/EmployerPortal/EmployerDashboard.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({
    token: 't', user: { id: 'e1', name: 'Acme Corp', email: 'employer@company.com', role: 'employer' },
  }));
}

function mockPortalFetch(status: 'Pending' | 'Active') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      profile: {
        id: 'e1', name: 'Acme Corp', email: 'employer@company.com', industry: 'Technology',
        size: '51–200', status, spoc: 'Asha Nambala', website: 'https://acme.example',
      },
      dashboard: {
        kpis: { activeDrives: 4, upcomingInterviews: 6, totalSlots: 9 },
        calendar: [],
        registrations: [],
        shortlist: [],
        notifications: [],
        notificationsUnread: 0,
      },
    }),
  }));
}

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthProvider>
          <EmployerDashboard />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerDashboard', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the greeting, KPIs, empty-state copy, and the Pending banner for a Pending employer', async () => {
    seedAuth();
    mockPortalFetch('Pending');
    renderDashboard();

    await waitFor(() => expect(screen.getByText('Welcome back, Asha Nambala')).toBeInTheDocument());

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();

    expect(screen.getByText(/No registrations yet/)).toBeInTheDocument();
    expect(screen.getByText(/No shortlisted candidates yet/)).toBeInTheDocument();
    expect(screen.getByText(/No upcoming interviews scheduled/)).toBeInTheDocument();

    expect(screen.getByText(/Pending review/)).toBeInTheDocument();
  });

  it('does not show the Pending banner for an Active employer', async () => {
    seedAuth();
    mockPortalFetch('Active');
    renderDashboard();

    await waitFor(() => expect(screen.getByText('Welcome back, Asha Nambala')).toBeInTheDocument());

    expect(screen.queryByText(/Pending review/)).not.toBeInTheDocument();
  });
});
