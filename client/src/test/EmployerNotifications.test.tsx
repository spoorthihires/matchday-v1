import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerNotifications } from '../pages/EmployerPortal/EmployerNotifications.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
const FEED = {
  items: [
    { id: 'reg:1:0', category: 'registration', title: 'Registration approved', body: 'Your registration for "Data Drive" (SDE) — Approved.', at: '2026-07-04T10:00:00.000Z', link: '/employer/registrations', read: false },
    { id: 'consent:2', category: 'candidate', title: 'Identity reveal granted', body: 'Candidate C-abc123 granted your reveal request for "Data Drive".', at: '2026-07-03T10:00:00.000Z', link: '/employer/drives/d1/consent', read: true },
    { id: 'booking:3', category: 'slot', title: 'New slot booking', body: 'Candidate C-def456 booked a slot on 2026-08-05 at 10:00 for "Data Drive".', at: '2026-07-02T10:00:00.000Z', link: '/employer/drives/d1/slots', read: false },
  ],
  unreadCount: 2,
  lastReadAt: null,
};
function mockFetch() {
  const calls: { url: string; method?: string }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    calls.push({ url, method: init?.method });
    if (url.includes('/notifications/read')) return { ok: true, status: 200, json: async () => ({ lastReadAt: '2026-07-05T00:00:00.000Z', unreadCount: 0 }) };
    return { ok: true, status: 200, json: async () => FEED };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/notifications']}>
        <AuthProvider><Routes><Route path="/employer/notifications" element={<EmployerNotifications />} /></Routes></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerNotifications', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('renders the feed rows + category chips', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Registration approved')).toBeInTheDocument());
    expect(screen.getByText('Identity reveal granted')).toBeInTheDocument();
    expect(screen.getByText('New slot booking')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrations' })).toBeInTheDocument();
  });

  it('filters by category chip', async () => {
    seedAuth(); mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Registration approved')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Slots' }));
    expect(screen.queryByText('Registration approved')).not.toBeInTheDocument();
    expect(screen.getByText('New slot booking')).toBeInTheDocument();
  });

  it('a View link carries the item link; mark-all-read fires POST', async () => {
    seedAuth(); const { calls } = mockFetch(); renderPage();
    await waitFor(() => expect(screen.getByText('Registration approved')).toBeInTheDocument());
    const viewLinks = screen.getAllByRole('link', { name: /View/ });
    expect(viewLinks[0]).toHaveAttribute('href', '/employer/registrations');
    fireEvent.click(screen.getByRole('button', { name: /Mark all as read/i }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('/notifications/read') && c.method === 'POST')).toBe(true));
  });

  it('shows the empty state', async () => {
    seedAuth();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [], unreadCount: 0, lastReadAt: null }) })));
    renderPage();
    await waitFor(() => expect(screen.getByText(/No notifications/i)).toBeInTheDocument());
  });
});
