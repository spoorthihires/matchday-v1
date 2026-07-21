import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerShortlist } from '../pages/EmployerPortal/EmployerShortlist.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const base = {
  branch: 'CSE', gradYear: 2026, source: 'Campus', cgpaBand: '8.0–8.5', instituteCategory: 'Tier-1',
  evaluationStatus: 'completed', evaluationLabel: 'Completed', stage: 'MatchReady', evalPill: 'Strong',
  noteCount: 0, consent: null, revealed: null,
};
const C1 = { ...base, jobseekerId: 'j1', code: 'C-AAA111', matchScore: 90, decision: 'Shortlisted' };
const C2 = { ...base, jobseekerId: 'j2', code: 'C-BBB222', matchScore: 70, evalPill: 'Qualified', decision: null };

function mockFetch() {
  const bulk = vi.fn();
  const packFn = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.includes('/candidates/bulk-decision') && method === 'POST') { bulk(JSON.parse(opts.body as string)); return { ok: true, status: 200, json: async () => ({ updated: 1 }) }; }
    if (url.includes('/shortlist/pack')) { packFn(url); return { ok: true, status: 200, json: async () => ({ driveName: 'Aug Drive', generatedAt: '2026-07-21T00:00:00.000Z', items: [{ code: 'C-AAA111', matchScore: 90, evalPill: 'Strong', branch: 'CSE', gradYear: 2026, cgpaBand: '8.0–8.5', instituteCategory: 'Tier-1', stage: 'MatchReady', consentStatus: 'none', notes: [] }] }) }; }
    if (url.includes('/candidates')) return { ok: true, status: 200, json: async () => ({ items: [C1, C2] }) };
    if (url.match(/\/drives\/[^/]+$/)) return { ok: true, status: 200, json: async () => ({ id: 'd1', name: 'Aug Drive', primaryEventDate: '2026-09-01T00:00:00.000Z', eventDates: ['2026-09-01T00:00:00.000Z'] }) };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { bulk, packFn };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/shortlist']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/shortlist" element={<EmployerShortlist />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerShortlist', () => {
  beforeEach(() => { localStorage.clear(); (URL as unknown as { createObjectURL?: unknown }).createObjectURL = vi.fn(() => 'blob:x'); (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL = vi.fn(); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('renders the full pool with a stable select-all count', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('C-AAA111')).toBeInTheDocument());
    expect(screen.getByText('C-BBB222')).toBeInTheDocument();
    // "Select all (N)" is unique text (avoids matching the chip + a row's decision text)
    expect(screen.getByText(/Select all \(2\)/)).toBeInTheDocument();
  });

  it('bulk-shortlists the selected rows', async () => {
    seedAuth(); const { bulk } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('C-BBB222')).toBeInTheDocument());
    const row = screen.getByText('C-BBB222').closest('.cand-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Bulk shortlist/i }));
    await waitFor(() => expect(bulk).toHaveBeenCalled());
    expect(bulk.mock.calls[0][0]).toEqual({ jobseekerIds: ['j2'], decision: 'Shortlisted' });
  });

  it('downloads the shortlist pack (fetches the pack endpoint)', async () => {
    seedAuth(); const { packFn } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('C-AAA111')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Download shortlist pack/i }));
    await waitFor(() => expect(packFn).toHaveBeenCalled());
    expect(packFn.mock.calls[0][0]).toMatch(/\/shortlist\/pack$/);
  });
});
