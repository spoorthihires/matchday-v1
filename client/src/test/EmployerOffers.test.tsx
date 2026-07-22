import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerOffers } from '../pages/EmployerPortal/EmployerOffers.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const OFFER = { jobseekerId: 'j1', code: 'C-AAA111', matchScore: 88, revealed: { name: 'Ananya Sharma', email: 'a@x.test' }, status: 'Sent', response: 'Pending', ctc: 18, location: 'Bengaluru', mode: 'Remote', joinDate: null, declineReason: '' };
const candBase = { branch: 'CSE', gradYear: 2026, source: 'Campus', cgpaBand: '8.0–8.5', instituteCategory: 'Tier-1', evaluationStatus: 'completed', evaluationLabel: 'Completed', stage: 'MatchReady', matchScore: 88, evalPill: 'Strong', decision: 'Shortlisted', noteCount: 0, revealed: null };
const GRANTED_NO_OFFER = { ...candBase, jobseekerId: 'j2', code: 'C-BBB222', consent: { status: 'granted', expired: false, requestedAt: null, expiresAt: null, respondedAt: null } };

function mockFetch(offers: unknown[]) {
  const put = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.match(/\/offer$/) && method === 'PUT') { put(url, JSON.parse(opts.body as string)); return { ok: true, status: 200, json: async () => ({ ...OFFER, status: JSON.parse(opts.body as string).status }) }; }
    if (url.match(/\/offers$/)) return { ok: true, status: 200, json: async () => ({ items: offers, counts: { Draft: 0, Sent: offers.length, Accepted: 0, Declined: 0, Joined: 0 } }) };
    if (url.includes('/candidates')) return { ok: true, status: 200, json: async () => ({ items: [GRANTED_NO_OFFER] }) };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { put };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/offers']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/offers" element={<EmployerOffers />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerOffers', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders an offer row (revealed name + code + match)', async () => {
    seedAuth(); mockFetch([OFFER]); renderPage();
    await waitFor(() => expect(screen.getByText(/Ananya Sharma/)).toBeInTheDocument());
    // `Sent` is ambiguous (status pill + KPI label + a <select> option); assert unique row text instead
    expect(screen.getByText(/C-AAA111/)).toBeInTheDocument();
    expect(screen.getByText(/match 88/)).toBeInTheDocument();
  });

  it('updates an offer status via the mutation', async () => {
    seedAuth(); const { put } = mockFetch([OFFER]); renderPage();
    await waitFor(() => expect(screen.getByText(/Ananya Sharma/)).toBeInTheDocument());
    const row = screen.getByText(/Ananya Sharma/).closest('.cand-row') as HTMLElement;
    // set the status select to 'Accepted' then save
    fireEvent.change(within(row).getByLabelText(/Status/i), { target: { value: 'Accepted' } });
    fireEvent.click(within(row).getByRole('button', { name: /Update/i }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][0]).toMatch(/\/candidates\/j1\/offer$/);
    expect(put.mock.calls[0][1]).toMatchObject({ status: 'Accepted' });
  });

  it('shows the empty state when there are no offers', async () => {
    seedAuth(); mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByText(/No offers yet/i)).toBeInTheDocument());
  });
});
