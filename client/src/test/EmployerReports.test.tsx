import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerReports } from '../pages/EmployerPortal/EmployerReports.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const REPORT = {
  scope: 'all',
  drives: [{ id: 'd1', name: 'Aug Drive' }, { id: 'd2', name: 'Sep Drive' }],
  funnel: [
    { stage: 'Recommended', count: 10, conversionPct: 100 }, { stage: 'Shortlisted', count: 6, conversionPct: 60 },
    { stage: 'Confirmed', count: 4, conversionPct: 67 }, { stage: 'Interviewed', count: 3, conversionPct: 75 },
    { stage: 'Offered', count: 2, conversionPct: 67 }, { stage: 'Accepted', count: 1, conversionPct: 50 },
    { stage: 'Joined', count: 1, conversionPct: 100 },
  ],
  kpis: { recommended: 10, shortlisted: 6, interviewsScheduled: 3, offersSent: 2, offersAccepted: 1, dropOffPct: 83, avgMatchScore: 74 },
};
function mockFetch() {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ ...REPORT, scope: url.includes('driveId=d1') ? 'd1' : 'all' }) }; });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/reports']}>
        <AuthProvider><Routes><Route path="/employer/reports" element={<EmployerReports />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerReports', () => {
  beforeEach(() => { localStorage.clear(); (URL as unknown as { createObjectURL?: unknown }).createObjectURL = vi.fn(() => 'blob:x'); (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL = vi.fn(); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('renders the KPI grid + funnel from the report', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Recommended')).toBeInTheDocument());
    expect(screen.getByText(/Drop-off/i)).toBeInTheDocument();
    expect(screen.getByText('Joined')).toBeInTheDocument();
    expect(screen.getByText(/60% of prev/)).toBeInTheDocument(); // Shortlisted conversion
  });

  it('switches drive via the selector (fires a scoped fetch)', async () => {
    seedAuth(); const { calls } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Recommended')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Drive/i), { target: { value: 'd1' } });
    await waitFor(() => expect(calls.some((u) => u.includes('driveId=d1'))).toBe(true));
  });

  it('exports the report CSV', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Recommended')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Export/i }));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});
