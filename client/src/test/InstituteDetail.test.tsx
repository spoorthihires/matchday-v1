import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { InstituteDetail } from '../pages/Institutes/detail/InstituteDetail.js';
import type { InstituteDetailResponse } from '../types/institutes.js';

const DETAIL: InstituteDetailResponse = {
  institute: {
    _id: 'abc',
    name: 'VNR Vignana Jyothi',
    city: 'Hyderabad',
    type: 'Engineering College',
    status: 'Active',
    owner: 'Dr. Rao',
    email: 'rao@vnr.edu',
    ownershipHistory: [
      { owner: 'Prof. Legacy Head', email: 'legacy@vnr.edu', changedAt: '2026-05-30T00:00:00.000Z', changedBy: 'Platform Admin' },
      { owner: 'Dr. Rao', email: 'rao@vnr.edu', changedAt: '2026-06-12T00:00:00.000Z', changedBy: 'Sharath P.' },
    ],
    createdAt: '2026-05-30T00:00:00.000Z',
  },
  funnel: { uploaded: 1000, signupPct: 80, completionPct: 70, matchReadyPct: 60, shortlistPct: 40, offerPct: 20, joinedPct: 10 },
  kpis: { uploaded: 1000, matchReadyPct: 60, shortlistPct: 40, joinedPct: 10 },
  performance: { matchReadyPct: 60, joinedPct: 10, avgMatchReadyPct: 55, rank: 3, ofActive: 20 },
  assignedDrives: 3,
};

function renderDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/institutes/abc']}>
        <AuthProvider>
          <Routes>
            <Route path="/institutes/:id" element={<InstituteDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InstituteDetail', () => {
  beforeEach(() => {
    localStorage.clear();
    // Seed a logged-in session so useInstitute's `enabled: !!token` fires (mirrors
    // AuthContext's STORAGE_KEY/readStored shape) — this page requires auth like every other
    // route mounted under <ProtectedRoute>.
    localStorage.setItem('matchday.auth', JSON.stringify({
      token: 'test-token',
      user: { id: 'u1', name: 'Test Admin', email: 'admin@matchday.io', role: 'admin' },
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => DETAIL,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the institute name, an Overview funnel percentage, the real assigned-drives count, and switches to the real Drives tab', async () => {
    renderDetail();

    // The name renders twice (AppShell's Topbar <h1> title, plus the .idhead <h2>) — assert via
    // the Topbar heading, which is unique.
    expect(await screen.findByRole('heading', { level: 1, name: 'VNR Vignana Jyothi' })).toBeInTheDocument();

    // Overview is the default active tab; its funnel snapshot's first step ("Uploaded") is the
    // only place a bare "100%" is rendered anywhere on the page, so this pins down that the
    // funnel snapshot bound to `funnel` actually rendered.
    expect(screen.getByText('100%')).toBeInTheDocument();

    // Header now shows the real assignedDrives count (3, from the DETAIL fixture) instead of the
    // hardcoded "0 drives".
    expect(screen.getByText('3 drives')).toBeInTheDocument();

    // TabDrivesComingSoon has been replaced by the real TabDrives — this suite's blanket fetch
    // mock resolves every URL (including GET /institutes/abc/drives) with the DETAIL fixture,
    // which has no `items`, so TabDrives renders its empty state rather than a drive row.
    await userEvent.click(screen.getByRole('button', { name: 'Drives' }));
    expect(await screen.findByText(/no drives assigned yet/i)).toBeInTheDocument();
  });
});
