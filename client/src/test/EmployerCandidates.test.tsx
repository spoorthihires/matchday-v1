import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerCandidates } from '../pages/EmployerPortal/EmployerCandidates.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const CAND = {
  jobseekerId: 'j1', code: 'C-ABC123', branch: 'CSE', gradYear: 2026, source: 'Campus', cgpaBand: '8.0–8.5',
  instituteCategory: 'Tier-1', evaluationStatus: 'completed', evaluationLabel: 'Completed', stage: 'MatchReady',
  matchScore: 82, evalPill: 'Strong', decision: null, noteCount: 0,
};
// Query-aware: `items` is returned for calls WITHOUT a decision=Shortlisted filter (i.e. the
// page's own filtered list), while `shortlistedItems` (defaulting to `items`) is returned for
// calls whose querystring asks for decision=Shortlisted (the dedicated CTA-gating query added
// by the merge-blocker fix). This lets tests exercise "filtered list empty, but a shortlisted
// candidate exists" independently of the visible list.
function mockFetch(items: unknown[], shortlistedItems: unknown[] = items) {
  const put = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.match(/\/candidates\/[^/]+\/decision$/) && method === 'PUT') {
      put(url, JSON.parse(opts.body as string));
      return { ok: true, status: 200, json: async () => ({ ...CAND, decision: 'Shortlisted' }) };
    }
    if (url.includes('/candidates')) {
      const isShortlistedQuery = url.includes('decision=Shortlisted');
      return { ok: true, status: 200, json: async () => ({ items: isShortlistedQuery ? shortlistedItems : items }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { put };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/candidates']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/candidates" element={<EmployerCandidates />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerCandidates', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders masked candidate rows (code, no name)', async () => {
    seedAuth(); mockFetch([CAND]); renderPage();
    await waitFor(() => expect(screen.getByText('C-ABC123')).toBeInTheDocument());
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.queryByText(/Real Name/)).toBeNull();
  });

  it('fires the decision mutation on Shortlist', async () => {
    seedAuth(); const { put } = mockFetch([CAND]); renderPage();
    await waitFor(() => expect(screen.getByText('C-ABC123')).toBeInTheDocument());
    const row = screen.getByText('C-ABC123').closest('.cand-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Shortlist/i }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][1]).toEqual({ decision: 'Shortlisted' });
  });

  it('shows the empty state', async () => {
    seedAuth(); mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByText(/No jobseekers/i)).toBeInTheDocument());
  });

  it('keeps "Consent status" enabled when filtered to Rejected (empty visible list) but a shortlisted candidate exists', async () => {
    seedAuth();
    const SHORTLISTED = { ...CAND, jobseekerId: 'j2', code: 'C-SHORT01', decision: 'Shortlisted' as const };
    mockFetch([], [SHORTLISTED]); // visible/filtered list is empty; dedicated shortlisted query has one
    renderPage();
    await waitFor(() => expect(screen.getByText(/No jobseekers/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Rejected' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rejected' })).toHaveClass('on'));
    expect(screen.getByText(/No jobseekers/i)).toBeInTheDocument(); // still empty under the Rejected filter
    await waitFor(() => expect(screen.getByRole('button', { name: 'Consent status' })).not.toBeDisabled());
  });
});
