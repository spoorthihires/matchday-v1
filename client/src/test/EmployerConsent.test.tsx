import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerConsent } from '../pages/EmployerPortal/EmployerConsent.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const base = {
  branch: 'CSE', gradYear: 2026, source: 'Campus', cgpaBand: '8.0–8.5', instituteCategory: 'Tier-1',
  evaluationStatus: 'completed', evaluationLabel: 'Completed', stage: 'MatchReady', matchScore: 82, evalPill: 'Strong',
  decision: 'Shortlisted', noteCount: 0,
};
const WAITING = { ...base, jobseekerId: 'j1', code: 'C-AAA111', consent: { status: 'requested', expired: false, requestedAt: '2026-07-20T00:00:00.000Z', expiresAt: '2026-07-22T00:00:00.000Z', respondedAt: null }, revealed: null };
const GRANTED = { ...base, jobseekerId: 'j2', code: 'C-BBB222', consent: { status: 'granted', expired: false, requestedAt: '2026-07-19T00:00:00.000Z', expiresAt: '2026-07-21T00:00:00.000Z', respondedAt: '2026-07-20T00:00:00.000Z' }, revealed: { name: 'Ananya Sharma', email: 'ananya@x.test', institute: 'CBIT', city: 'Hyd' } };
const FRESH = { ...base, jobseekerId: 'j3', code: 'C-CCC333', consent: null, revealed: null };

function mockFetch(items: unknown[]) {
  const post = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.includes('/reveal-request') && method === 'POST') { post(url); return { ok: true, status: 200, json: async () => ({}) }; }
    if (url.includes('/candidates')) return { ok: true, status: 200, json: async () => ({ items }) };
    if (url.match(/\/drives\/[^/]+$/)) return { ok: true, status: 200, json: async () => ({ id: 'd1', name: 'Aug Drive' }) };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { post };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/consent']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/consent" element={<EmployerConsent />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerConsent', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('shows a granted row with the revealed identity and a masked waiting row', async () => {
    seedAuth(); mockFetch([WAITING, GRANTED]); renderPage();
    await waitFor(() => expect(screen.getByText('Ananya Sharma')).toBeInTheDocument()); // granted → revealed
    expect(screen.getByText('C-AAA111')).toBeInTheDocument(); // waiting → still masked
    expect(screen.getByText(/Interested/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting/i)).toBeInTheDocument();
  });

  it('fires a reveal request for a Shortlisted-not-yet-requested candidate', async () => {
    seedAuth(); const { post } = mockFetch([FRESH]); renderPage();
    await waitFor(() => expect(screen.getByText('C-CCC333')).toBeInTheDocument());
    const row = screen.getByText('C-CCC333').closest('.cand-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Request reveal/i }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toMatch(/\/candidates\/j3\/reveal-request$/);
  });

  it('shows the empty state when no candidates are shortlisted', async () => {
    seedAuth(); mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByText(/shortlist jobseekers/i)).toBeInTheDocument());
  });
});
