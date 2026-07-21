import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerTeam } from '../pages/EmployerPortal/EmployerTeam.js';
import type { EmployerTeamResponse } from '../types/employer.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
// Typed as EmployerTeamResponse (not just inferred from the literal) so `selfId` widens to
// `string | null` -- otherwise the 'read-only' test's `selfId: 'm2'` override would fail to
// typecheck against a param whose default narrows selfId to the literal `null`.
const OWNER_VIEW: EmployerTeamResponse = {
  members: [
    { id: 'm1', name: 'Alice Admin', email: 'alice@acme.test', role: 'Admin', status: 'Active', createdAt: '2026-07-03T10:00:00.000Z' },
    { id: 'm2', name: 'Bob Rec', email: 'bob@acme.test', role: 'Recruiter', status: 'Active', createdAt: '2026-07-02T10:00:00.000Z' },
  ],
  canManage: true, actingRole: 'Owner', selfId: null,
};
function mockFetch(view: EmployerTeamResponse = OWNER_VIEW) {
  const calls: { url: string; method?: string; body?: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method, body: init?.body });
    if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ id: 'm3', name: 'x', email: 'x@acme.test', role: 'Viewer', status: 'Active', createdAt: '2026-07-05T00:00:00.000Z' }) };
    if (init?.method === 'PATCH') return { ok: true, status: 200, json: async () => ({ ...view.members[0], role: 'Viewer' }) };
    if (init?.method === 'DELETE') return { ok: true, status: 200, json: async () => ({ ok: true }) };
    return { ok: true, status: 200, json: async () => view };
  }));
  return { calls };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/team']}>
        <AuthProvider><Routes><Route path="/employer/team" element={<EmployerTeam />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerTeam', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('canManage: renders members, the add form, and role selects', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Alice Admin')).toBeInTheDocument());
    expect(screen.getByText('bob@acme.test')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Full name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add member/i })).toBeInTheDocument();
  });

  it('adds a member (POST with entered fields)', async () => {
    seedAuth(); const { calls } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Add member/i })).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Full name/i), { target: { value: 'Carol New' } });
    fireEvent.change(screen.getByPlaceholderText(/Email/i), { target: { value: 'carol@acme.test' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'carolpass1' } });
    fireEvent.click(screen.getByRole('button', { name: /Add member/i }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && (c.body ?? '').includes('carol@acme.test'))).toBe(true));
  });

  it('removes a member (DELETE)', async () => {
    seedAuth(); const { calls } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Alice Admin')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /Remove/i })[0]);
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/me/employer/team/'))).toBe(true));
  });

  it('read-only when canManage is false (no add form, shows the note)', async () => {
    seedAuth(); mockFetch({ members: OWNER_VIEW.members, canManage: false, actingRole: 'Recruiter', selfId: 'm2' }); renderPage();
    await waitFor(() => expect(screen.getByText('Alice Admin')).toBeInTheDocument());
    expect(screen.queryByPlaceholderText(/Full name/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only admins can manage/i)).toBeInTheDocument();
  });
});
