import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { ApprovalsPage } from '../pages/Employers/approvals/ApprovalsPage.js';
import type { Registration, RegistrationListResponse } from '../types/employers.js';

const REG_1: Registration = {
  _id: 'reg-1',
  company: 'Vaultline Systems',
  industry: 'Fintech',
  role: 'Backend Engineer (Go)',
  driveId: 'drive-1',
  driveName: 'Backend · July Cohort',
  openings: 6,
  ctcRange: '₹18–26 LPA',
  skills: ['Go', 'PostgreSQL', 'gRPC'],
  slot: 'Wed, Jul 16 · 10:00–12:00',
  panel: [{ name: 'A. Khanna', role: 'Engineering Manager' }],
  jd: 'We are hiring backend engineers.\n\nResponsibilities:\n• Design services',
  submittedBy: 'D. Sharma',
  status: 'Pending review',
  activity: [{ action: 'Submitted for review', by: 'D. Sharma (Vaultline)', at: '2026-07-14T10:00:00.000Z' }],
  createdAt: '2026-07-14T10:00:00.000Z',
};

const REG_2: Registration = {
  _id: 'reg-2',
  company: 'Cartsy Commerce',
  industry: 'E-commerce',
  role: 'Frontend Engineer',
  driveId: 'drive-2',
  driveName: 'Frontend · July Cohort',
  openings: 5,
  ctcRange: '₹14–20 LPA',
  skills: ['React', 'TypeScript'],
  slot: 'Sat, Jul 26 · 11:00–13:00',
  panel: [{ name: 'N. Rao', role: 'Frontend Lead' }],
  jd: 'Own customer-facing storefront experiences.',
  submittedBy: 'N. Rao',
  status: 'Approved',
  activity: [
    { action: 'Approved', by: 'You', at: '2026-07-13T10:00:00.000Z' },
    { action: 'Submitted for review', by: 'N. Rao (Cartsy)', at: '2026-07-12T10:00:00.000Z' },
  ],
  createdAt: '2026-07-12T10:00:00.000Z',
};

const LIST_RESPONSE: RegistrationListResponse = { items: [REG_1, REG_2], counts: { pending: 1, total: 2 } };

const UPDATED_REG_1: Registration = {
  ...REG_1,
  status: 'Approved',
  activity: [{ action: 'Approved', by: 'Platform Admin', at: '2026-07-15T00:00:00.000Z' }, ...REG_1.activity],
};

const UPDATED_LIST_RESPONSE: RegistrationListResponse = {
  items: [UPDATED_REG_1, REG_2],
  counts: { pending: 0, total: 2 },
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employers/approvals']}>
        <AuthProvider>
          <Routes>
            <Route path="/employers/approvals" element={<ApprovalsPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ApprovalsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    // Seed a logged-in session so useRegistrations'/useDrives' `enabled: !!token` fires (mirrors
    // AuthContext's STORAGE_KEY/readStored shape — see InstituteDetail.test.tsx).
    localStorage.setItem('matchday.auth', JSON.stringify({
      token: 'test-token',
      user: { id: 'u1', name: 'Test Admin', email: 'admin@matchday.io', role: 'admin' },
    }));

    // Routes on URL/method: GET /registrations is sequenced by call count so the refetch that
    // useRegistrationAction's onSuccess triggers (invalidating ['registrations']) picks up the
    // post-approve status; POST .../action returns the updated item; GET /drives is routed
    // defensively in case the Move Drive modal's useDrives call also fires.
    let registrationGetCalls = 0;
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/registrations') && url.includes('/action') && method === 'POST') {
        return Promise.resolve({ ok: true, status: 200, json: async () => UPDATED_REG_1 });
      }
      if (url.includes('/registrations') && method === 'GET') {
        registrationGetCalls += 1;
        const body = registrationGetCalls === 1 ? LIST_RESPONSE : UPDATED_LIST_RESPONSE;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      }
      if (url.includes('/drives')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [], total: 0, page: 1, limit: 100 }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the queue, selects an item, and approving the pending item updates its status', async () => {
    renderPage();
    const user = userEvent.setup();

    // Wait on the counts header (unique, and only renders once the list has loaded), then assert
    // both companies render — scoped to the list column, since the default-selected
    // registration's company also renders again in the detail's Company & Drive section, which
    // would make an unscoped query ambiguous.
    expect(await screen.findByText('1 awaiting review · 2 total')).toBeInTheDocument();
    const list = document.querySelector('.appr-list') as HTMLElement;
    expect(within(list).getByText('Vaultline Systems')).toBeInTheDocument();
    expect(within(list).getByText('Cartsy Commerce')).toBeInTheDocument();

    // Selection defaults to the first item — its role shows in the detail header (`.htitle`;
    // the same role string also appears in the Requirement grid's "Role" field, hence the
    // selector scoping every role assertion below).
    expect(screen.getByText('Backend Engineer (Go)', { selector: '.htitle' })).toBeInTheDocument();

    // Clicking the second item shows its role in the detail.
    await user.click(within(list).getByText('Cartsy Commerce'));
    expect(await screen.findByText('Frontend Engineer', { selector: '.htitle' })).toBeInTheDocument();

    // Re-select the pending (first) registration — Cartsy is Approved, so its Approve/Reject/
    // Request Changes actions are disabled.
    await user.click(within(list).getByText('Vaultline Systems'));
    expect(await screen.findByText('Backend Engineer (Go)', { selector: '.htitle' })).toBeInTheDocument();

    // Approve fires directly (no modal) — assert the POST body is exactly {action:'approve'}.
    await user.click(screen.getByRole('button', { name: /approve/i }));

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('/action'))).toBe(true);
    });
    const [actionUrl, actionOpts] = fetchMock.mock.calls.find(
      ([url]) => typeof url === 'string' && url.includes('/action'),
    )!;
    expect(actionUrl).toContain('/registrations/reg-1/action');
    expect(JSON.parse((actionOpts as RequestInit).body as string)).toEqual({ action: 'approve' });

    // After the mutation invalidates ['registrations'], the refetch (second GET) returns the
    // updated item — the detail's status badge flips to Approved.
    await waitFor(() => {
      const detail = document.querySelector('.appr-detail') as HTMLElement;
      expect(within(detail).getByText('Approved', { selector: '.badge-st' })).toBeInTheDocument();
    });
  });
});
