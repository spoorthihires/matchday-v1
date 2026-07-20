import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerRegistrations } from '../pages/EmployerPortal/EmployerRegistrations.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({
    token: 't', user: { id: 'e1', name: 'Acme Corp', email: 'employer@company.com', role: 'employer' },
  }));
}

const PENDING_ITEM = {
  id: 'r1', driveId: 'd1', driveName: 'Data Analyst MatchDay', role: 'Data Analyst', openings: 2,
  status: 'Pending review', submittedAt: '2026-07-13T00:00:00.000Z', latestActivity: 'Awaiting admin review',
};
const APPROVED_ITEM = {
  id: 'r2', driveId: 'd2', driveName: 'ML Engineer MatchDay', role: 'ML Engineer', openings: 1,
  status: 'Approved', submittedAt: '2026-07-10T00:00:00.000Z', latestActivity: 'Book your Wednesday slot',
};

function mockRegistrationsFetch(items: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ items }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/registrations']}>
        <AuthProvider>
          <Routes>
            <Route path="/employer/registrations" element={<EmployerRegistrations />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerRegistrations', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders rows with drive/role/openings and the correct status badge for each status', async () => {
    seedAuth();
    mockRegistrationsFetch([PENDING_ITEM, APPROVED_ITEM]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Data Analyst MatchDay')).toBeInTheDocument());
    expect(screen.getByText('ML Engineer MatchDay')).toBeInTheDocument();

    const pendingCard = screen.getByText('Data Analyst MatchDay').closest('.reg-card') as HTMLElement;
    expect(within(pendingCard).getByText(/Data Analyst · 2 openings/)).toBeInTheDocument();
    const pendingBadge = within(pendingCard).getByText('Pending review');
    expect(pendingBadge).toHaveClass('status-pill', 'st-inprog');
    expect(within(pendingCard).getByText(/Awaiting admin review/)).toBeInTheDocument();

    const approvedCard = screen.getByText('ML Engineer MatchDay').closest('.reg-card') as HTMLElement;
    expect(within(approvedCard).getByText(/ML Engineer · 1 opening\b/)).toBeInTheDocument();
    const approvedBadge = within(approvedCard).getByText('Approved');
    expect(approvedBadge).toHaveClass('status-pill', 'st-approved');
  });

  it('shows the empty state when there are no registrations', async () => {
    seedAuth();
    mockRegistrationsFetch([]);
    renderPage();

    await waitFor(() => expect(screen.getByText('No registrations yet')).toBeInTheDocument());
    expect(screen.queryByText('Data Analyst MatchDay')).not.toBeInTheDocument();
  });
});
