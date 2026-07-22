import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerKanban } from '../pages/EmployerPortal/EmployerKanban.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const base = { branch: 'CSE', matchScore: 88, evalPill: 'Strong', decision: 'Shortlisted', consentStatus: 'none' };
const SHORT = { ...base, jobseekerId: 'j1', code: 'C-AAA111', stage: 'Shortlisted', revealed: null };
const GRANTED = { ...base, jobseekerId: 'j2', code: 'C-BBB222', stage: 'Candidate Confirmed', consentStatus: 'granted', revealed: { name: 'Ananya Sharma', email: 'a@x.test' } };

function mockFetch(items: unknown[]) {
  const move = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.match(/\/stage$/) && method === 'PATCH') { move(url, JSON.parse(opts.body as string)); return { ok: true, status: 200, json: async () => ({ ...SHORT, stage: JSON.parse(opts.body as string).stage }) }; }
    if (url.match(/\/board$/)) return { ok: true, status: 200, json: async () => ({ items }) };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { move };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/board']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/board" element={<EmployerKanban />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerKanban', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('places cards in their stage columns; granted shows the revealed name', async () => {
    seedAuth(); mockFetch([SHORT, GRANTED]); renderPage();
    await waitFor(() => expect(screen.getByText('C-AAA111')).toBeInTheDocument());
    expect(screen.getByText(/Ananya Sharma/)).toBeInTheDocument();     // granted → revealed
  });

  it('Advance moves a card to the next stage in the order', async () => {
    seedAuth(); const { move } = mockFetch([SHORT]); renderPage();
    await waitFor(() => expect(screen.getByText('C-AAA111')).toBeInTheDocument());
    const card = screen.getByText('C-AAA111').closest('.kcard') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Advance/i }));
    await waitFor(() => expect(move).toHaveBeenCalled());
    expect(move.mock.calls[0][0]).toMatch(/\/candidates\/j1\/stage$/);
    expect(move.mock.calls[0][1]).toEqual({ stage: 'Candidate Confirmed' }); // Shortlisted → next
  });

  it('Reject moves a card to Rejected', async () => {
    seedAuth(); const { move } = mockFetch([SHORT]); renderPage();
    await waitFor(() => expect(screen.getByText('C-AAA111')).toBeInTheDocument());
    const card = screen.getByText('C-AAA111').closest('.kcard') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Reject/i }));
    await waitFor(() => expect(move).toHaveBeenCalled());
    expect(move.mock.calls[0][1]).toEqual({ stage: 'Rejected' });
  });

  it('shows the empty state when the pool is empty', async () => {
    seedAuth(); mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByText(/No candidates in the pipeline/i)).toBeInTheDocument());
  });
});
