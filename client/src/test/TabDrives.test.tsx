import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { TabDrives } from '../pages/Institutes/detail/TabDrives.js';

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AuthProvider><TabDrives instituteId="i1" /></AuthProvider></QueryClientProvider>);
}

describe('TabDrives', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/institutes/i1/drives') && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [{ id: 'd1', name: 'FE Cohort', domain: 'Web', stream: 'B.Tech', status: 'Active', month: 'Jul 2026' }] }) });
      }
      if (url.includes('/institutes/i1/drives/d1') && method === 'DELETE') return Promise.resolve({ ok: true, status: 200, json: async () => ({ deleted: true }) });
      if (url.includes('/drives') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [], total: 0, page: 1, limit: 100 }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders assigned drives and × fires an unassign DELETE', async () => {
    renderTab();
    const user = userEvent.setup();
    expect(await screen.findByText('FE Cohort')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /unassign FE Cohort/i }));
    await waitFor(() => {
      const fm = fetch as unknown as ReturnType<typeof vi.fn>;
      expect(fm.mock.calls.some(([u, o]) => typeof u === 'string' && u.includes('/institutes/i1/drives/d1') && (o as RequestInit | undefined)?.method === 'DELETE')).toBe(true);
    });
  });
});
