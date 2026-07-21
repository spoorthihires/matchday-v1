import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerCandidatePassport } from '../pages/EmployerPortal/EmployerCandidatePassport.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const PASSPORT = {
  jobseekerId: 'j1', code: 'C-ABC123', branch: 'CSE', gradYear: 2026, source: 'Campus', cgpaBand: '8.0–8.5',
  instituteCategory: 'Tier-1', evaluationStatus: 'completed', evaluationLabel: 'Completed', stage: 'MatchReady',
  matchScore: 82, evalPill: 'Strong', decision: null, noteCount: 0,
  factors: { cgpa: { weight: 0.5, value: 0.8, contribution: 40 }, evaluation: { weight: 0.3, value: 1, contribution: 30 }, stage: { weight: 0.2, value: 0.6, contribution: 12 } },
  notes: [],
};
function mockFetch() {
  const post = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.match(/\/notes$/) && method === 'POST') {
      post(JSON.parse(opts.body as string));
      return { ok: true, status: 200, json: async () => ({ ...PASSPORT, notes: [{ text: JSON.parse(opts.body as string).text, by: 'Jane', at: '2026-07-20T00:00:00.000Z' }] }) };
    }
    if (url.match(/\/candidates\/[^/]+$/)) return { ok: true, status: 200, json: async () => PASSPORT };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'no', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { post };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/candidates/j1']}>
        <AuthProvider><Routes><Route path="/employer/drives/:id/candidates/:jobseekerId" element={<EmployerCandidatePassport />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerCandidatePassport', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders the redacted passport with the score breakdown', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('C-ABC123')).toBeInTheDocument());
    expect(screen.getByText(/Identity hidden/i)).toBeInTheDocument();
    expect(screen.queryByText(/Real Name/)).toBeNull();
    expect(screen.getByText('CSE')).toBeInTheDocument();
    expect(screen.getByText(/40/)).toBeInTheDocument(); // cgpa factor contribution
  });

  it('adds a note', async () => {
    seedAuth(); const { post } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByPlaceholderText(/note/i)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/note/i), { target: { value: 'Strong SQL' } });
    fireEvent.click(screen.getByRole('button', { name: /Add note/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith({ text: 'Strong SQL' }));
  });

  it('blocks an empty note with show-err', async () => {
    seedAuth(); const { post } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Add note/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add note/i }));
    const field = screen.getByPlaceholderText(/note/i).closest('.field') as HTMLElement;
    await waitFor(() => expect(field).toHaveClass('show-err'));
    expect(post).not.toHaveBeenCalled();
  });
});
