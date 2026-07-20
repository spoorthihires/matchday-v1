import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerDriveDetail } from '../pages/EmployerPortal/EmployerDriveDetail.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({
    token: 't', user: { id: 'e1', name: 'Acme Corp', email: 'employer@company.com', role: 'employer' },
  }));
}

const DRIVE_DETAIL = {
  id: 'd1', name: 'ActiveOne', domain: 'Frontend', stream: 'B.Tech', month: 'Aug 2026',
  primaryEventDate: '2026-08-05T00:00:00.000Z', eventDates: ['2026-08-05T00:00:00.000Z'],
  candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday',
  status: 'Active', employerReg: 'Open', canRegister: true,
  eligibility: { sources: ['Institutes', 'Campus'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
  evaluation: [
    { key: 'mcq', enabled: true, config: { questions: 30, durationMin: 30 } },
    { key: 'coding', enabled: false, config: { problems: 3, durationMin: 60 } },
  ],
  streamId: 's1',
};

function mockDriveFetch(status = 200, body: unknown = DRIVE_DETAIL, registrations: unknown[] = []) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/me/employer/registrations')) {
      return { ok: true, status: 200, json: async () => ({ items: registrations }) };
    }
    return {
      ok: status < 400,
      status,
      json: async () => (status < 400 ? body : { error: { message: 'Drive not found', code: 'not_found' } }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(path = '/employer/drives/d1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/employer/drives" element={<div>MARKETPLACE PAGE</div>} />
            <Route path="/employer/drives/:id" element={<EmployerDriveDetail />} />
            <Route path="/employer/drives/:id/register" element={<div>REGISTER PLACEHOLDER</div>} />
            <Route path="/employer/drives/:id/slots" element={<div>SLOTS PLACEHOLDER</div>} />
            <Route path="/employer/drives/:id/candidates" element={<div>CANDIDATES PLACEHOLDER</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerDriveDetail', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the drive name, a fact, the eligibility branch, and only the enabled evaluation stage', async () => {
    seedAuth();
    mockDriveFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    expect(screen.getByText('Weekly')).toBeInTheDocument(); // frequency fact
    expect(screen.getByText('CSE')).toBeInTheDocument(); // eligibility branch
    expect(screen.getByText('mcq')).toBeInTheDocument(); // enabled stage
    expect(screen.queryByText('coding')).not.toBeInTheDocument(); // disabled stage not shown
  });

  it('navigates to the registration wizard when the Register CTA is clicked', async () => {
    seedAuth();
    mockDriveFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /register for this drive/i }));

    expect(await screen.findByText('REGISTER PLACEHOLDER')).toBeInTheDocument();
  });

  it('disables View slots and View candidates when there is no approved registration for this drive', async () => {
    seedAuth();
    mockDriveFetch(200, DRIVE_DETAIL, []);
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /view slots/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /view candidates/i })).toBeDisabled();
  });

  it('enables View slots and navigates to the slots page when the drive has an approved registration', async () => {
    seedAuth();
    mockDriveFetch(200, DRIVE_DETAIL, [{ id: 'r1', driveId: 'd1', driveName: 'ActiveOne', role: 'SDE', openings: 2, status: 'Approved', submittedAt: '2026-07-01T00:00:00.000Z', latestActivity: '2026-07-02T00:00:00.000Z' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    const btn = screen.getByRole('button', { name: /view slots/i });
    await waitFor(() => expect(btn).toBeEnabled());
    await userEvent.click(btn);

    expect(await screen.findByText('SLOTS PLACEHOLDER')).toBeInTheDocument();
  });

  it('enables View candidates and navigates to the candidates page when the drive has an approved registration', async () => {
    seedAuth();
    mockDriveFetch(200, DRIVE_DETAIL, [{ id: 'r1', driveId: 'd1', driveName: 'ActiveOne', role: 'SDE', openings: 2, status: 'Approved', submittedAt: '2026-07-01T00:00:00.000Z', latestActivity: '2026-07-02T00:00:00.000Z' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    const btn = screen.getByRole('button', { name: /view candidates/i });
    await waitFor(() => expect(btn).toBeEnabled());
    await userEvent.click(btn);

    expect(await screen.findByText('CANDIDATES PLACEHOLDER')).toBeInTheDocument();
  });

  it('hides the Register CTA when canRegister is false, but still shows View slots', async () => {
    seedAuth();
    mockDriveFetch(200, { ...DRIVE_DETAIL, canRegister: false });
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /register for this drive/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view slots/i })).toBeInTheDocument();
  });

  it('renders a not-found state when the drive fetch 404s', async () => {
    seedAuth();
    mockDriveFetch(404);
    renderPage();

    await waitFor(() => expect(screen.getByText(/drive not found/i)).toBeInTheDocument());
    expect(screen.queryByText('ActiveOne')).not.toBeInTheDocument();
  });
});
