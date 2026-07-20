import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerDrives } from '../pages/EmployerPortal/EmployerDrives.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({
    token: 't', user: { id: 'e1', name: 'Acme Corp', email: 'employer@company.com', role: 'employer' },
  }));
}

const ACTIVE_ONE = {
  id: 'd1', name: 'ActiveOne', domain: 'Frontend', stream: 'B.Tech', month: 'Aug 2026',
  primaryEventDate: '2026-08-05T00:00:00.000Z', eventDates: ['2026-08-05T00:00:00.000Z'],
  candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday',
  status: 'Active', employerReg: 'Open', canRegister: true,
};
const CLOSED_REG = {
  id: 'd2', name: 'ClosedReg', domain: 'Backend', stream: 'MCA', month: 'Sep 2026',
  primaryEventDate: '2026-09-02T00:00:00.000Z', eventDates: ['2026-09-02T00:00:00.000Z'],
  candCap: 50, empCap: 4, slotCap: 10, frequency: 'Monthly', eventDay: 'Wednesday',
  status: 'Active', employerReg: 'Closed', canRegister: false,
};

function mockDrivesFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ items: [ACTIVE_ONE, CLOSED_REG] }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives']}>
        <AuthProvider>
          <Routes>
            <Route path="/employer/drives" element={<EmployerDrives />} />
            <Route path="/employer/drives/:id" element={<div>DRIVE DETAIL PAGE</div>} />
            <Route path="/employer/coming-soon/:slug" element={<div>COMING SOON PAGE</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerDrives', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders drive cards from the marketplace response, hiding Register when canRegister is false', async () => {
    seedAuth();
    mockDrivesFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    expect(screen.getByText('ClosedReg')).toBeInTheDocument();

    const activeCard = screen.getByText('ActiveOne').closest('.dcard') as HTMLElement;
    expect(within(activeCard).getByRole('button', { name: /register/i })).toBeInTheDocument();

    const closedCard = screen.getByText('ClosedReg').closest('.dcard') as HTMLElement;
    expect(within(closedCard).queryByRole('button', { name: /register/i })).not.toBeInTheDocument();
  });

  it('re-requests with the q param when the search box changes', async () => {
    seedAuth();
    const fetchMock = mockDrivesFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText(/Search drives/i), 'Active');

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('q=Active'))).toBe(true);
    });
  });

  it('re-requests with the domain param when a domain chip is clicked', async () => {
    seedAuth();
    const fetchMock = mockDrivesFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Backend' }));

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('domain=Backend'))).toBe(true);
    });
  });

  it('navigates to the drive detail route when View is clicked', async () => {
    seedAuth();
    mockDrivesFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    const activeCard = screen.getByText('ActiveOne').closest('.dcard') as HTMLElement;
    await userEvent.click(within(activeCard).getByRole('button', { name: /view/i }));

    expect(await screen.findByText('DRIVE DETAIL PAGE')).toBeInTheDocument();
  });
});
