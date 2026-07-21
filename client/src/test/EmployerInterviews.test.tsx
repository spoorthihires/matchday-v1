import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerInterviews } from '../pages/EmployerPortal/EmployerInterviews.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const candBase = { branch: 'CSE', gradYear: 2026, source: 'Campus', cgpaBand: '8.0–8.5', instituteCategory: 'Tier-1', evaluationStatus: 'completed', evaluationLabel: 'Completed', stage: 'MatchReady', matchScore: 90, evalPill: 'Strong', decision: 'Shortlisted', noteCount: 0, revealed: null };
const GRANTED = { ...candBase, jobseekerId: 'j1', code: 'C-AAA111', consent: { status: 'granted', expired: false, requestedAt: null, expiresAt: null, respondedAt: null } };
const NOT_GRANTED = { ...candBase, jobseekerId: 'j2', code: 'C-BBB222', consent: { status: 'requested', expired: false, requestedAt: null, expiresAt: null, respondedAt: null } };
const SLOT = { id: 's1', date: '2026-08-05T00:00:00.000Z', start: '10:00', end: '12:00', capacity: 10, booked: 0, status: 'Scheduled', link: 'https://meet.test/x' };
const INTERVIEW = { id: 'iv1', jobseekerId: 'j1', code: 'C-AAA111', name: 'Ananya Sharma', email: 'a@x.test', time: '10:30', status: 'Scheduled', interviewers: ['Priya M'], slot: { id: 's1', date: '2026-08-05T00:00:00.000Z', start: '10:00', end: '12:00', link: 'https://meet.test/x' } };

function mockFetch(interviews: unknown[]) {
  const sched = vi.fn(); const act = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.match(/\/interviews$/) && method === 'POST') { sched(JSON.parse(opts.body as string)); return { ok: true, status: 201, json: async () => INTERVIEW }; }
    if (url.match(/\/interviews\/[^/]+$/) && method === 'PATCH') { act(url, JSON.parse(opts.body as string)); return { ok: true, status: 200, json: async () => ({ ...INTERVIEW, status: 'Confirmed' }) }; }
    if (url.match(/\/interviews$/)) return { ok: true, status: 200, json: async () => ({ items: interviews }) };
    if (url.includes('/candidates')) return { ok: true, status: 200, json: async () => ({ items: [GRANTED, NOT_GRANTED] }) };
    if (url.match(/\/slots$/)) return { ok: true, status: 200, json: async () => ({ items: [SLOT] }) };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { sched, act };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/interviews']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/interviews" element={<EmployerInterviews />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerInterviews', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders the agenda with a revealed candidate + status + slot link', async () => {
    seedAuth(); mockFetch([INTERVIEW]); renderPage();
    await waitFor(() => expect(screen.getByText(/Ananya Sharma/)).toBeInTheDocument());
    expect(screen.getByText('10:30')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Join/i })).toHaveAttribute('href', 'https://meet.test/x');
  });

  it('the schedule form lists only consent-granted candidates and fires the mutation', async () => {
    seedAuth(); const { sched } = mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Schedule interview/i })).toBeInTheDocument());
    // candidate select has the granted candidate (C-AAA111) but not the un-granted one (C-BBB222)
    expect(screen.getByRole('option', { name: /C-AAA111/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /C-BBB222/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Schedule interview/i }));
    await waitFor(() => expect(sched).toHaveBeenCalled());
    // the form defaults time to the selected slot's `start` (10:00) — no manual entry needed
    expect(sched.mock.calls[0][0]).toMatchObject({ jobseekerId: 'j1', slotId: 's1', time: '10:00' });
  });

  it('confirm fires the action mutation', async () => {
    seedAuth(); const { act } = mockFetch([INTERVIEW]); renderPage();
    await waitFor(() => expect(screen.getByText(/Ananya Sharma/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    await waitFor(() => expect(act).toHaveBeenCalled());
    expect(act.mock.calls[0][0]).toMatch(/\/interviews\/iv1$/);
    expect(act.mock.calls[0][1]).toEqual({ action: 'confirm' });
  });

  it('shows the empty state when no interviews', async () => {
    seedAuth(); mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByText(/No interviews scheduled/i)).toBeInTheDocument());
  });
});
