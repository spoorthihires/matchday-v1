import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerSupport } from '../pages/EmployerPortal/EmployerSupport.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const LIST = { items: [{ id: 's1', ref: 'SUP-ABC123', category: 'No-show', subject: 'Candidate absent', message: 'The 10am candidate did not show.', priority: 'High', status: 'Open', createdAt: '2026-07-04T10:00:00.000Z' }] };
function mockFetch(list = LIST) {
  const calls: { url: string; method?: string; body?: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method, body: init?.body });
    if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ id: 's2', ref: 'SUP-XYZ999', category: 'Slot change', subject: 'x', message: 'y', priority: 'Normal', status: 'Open', createdAt: '2026-07-05T00:00:00.000Z' }) };
    return { ok: true, status: 200, json: async () => list };
  }));
  return { calls };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/support']}>
        <AuthProvider><Routes><Route path="/employer/support" element={<EmployerSupport />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerSupport', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('renders FAQ, the request form, and an existing ticket', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Candidate absent')).toBeInTheDocument());
    expect(screen.getByText('SUP-ABC123 · No-show')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit request/i })).toBeInTheDocument();
    expect(screen.getByText(/Frequently asked questions/i)).toBeInTheDocument();
  });

  it('submits a request (POST with the chosen fields)', async () => {
    seedAuth(); const { calls } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Submit request/i })).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Short summary/i), { target: { value: 'Need more profiles' } });
    fireEvent.change(screen.getByPlaceholderText(/Describe your request/i), { target: { value: 'Please add 5 more candidates.' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit request/i }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.includes('/me/employer/support') && (c.body ?? '').includes('Need more profiles'))).toBe(true));
  });

  it('shows the empty state when there are no requests', async () => {
    seedAuth(); mockFetch({ items: [] }); renderPage();
    await waitFor(() => expect(screen.getByText(/No requests yet/i)).toBeInTheDocument());
  });
});
