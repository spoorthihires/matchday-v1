import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { AssignDrivesModal } from '../pages/Institutes/detail/AssignDrivesModal.js';

const ALL_DRIVES = { items: [
  { id: 'd1', name: 'FE Cohort', domain: 'Web', stream: 'B.Tech', month: 'Jul 2026', frequency: 'One-time', eventDay: 'Wednesday', candCap: 100, empCap: 5, slotCap: 20, status: 'Active', createdBy: 'Admin', primaryEventDate: null },
  { id: 'd2', name: 'BE Cohort', domain: 'Backend', stream: 'B.Tech', month: 'Jul 2026', frequency: 'One-time', eventDay: 'Wednesday', candCap: 100, empCap: 5, slotCap: 20, status: 'Active', createdBy: 'Admin', primaryEventDate: null },
], total: 2, page: 1, limit: 100 };

function renderModal(onClose = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AuthProvider><AssignDrivesModal instituteId="i1" onClose={onClose} /></AuthProvider></QueryClientProvider>);
}

describe('AssignDrivesModal', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/institutes/i1/drives') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [{ id: 'd1', name: 'FE Cohort', domain: 'Web', stream: 'B.Tech', status: 'Active', month: 'Jul 2026' }] }) });
      if (url.includes('/drives') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ALL_DRIVES });
      if (url.includes('/institutes/i1/drives') && method === 'POST') return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [] }) });
      if (url.includes('/institutes/i1/drives/d1') && method === 'DELETE') return Promise.resolve({ ok: true, status: 200, json: async () => ({ deleted: true }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('pre-checks current assignments and Save diffs (assign added, unassign removed)', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();
    // d1 currently assigned → its checkbox is checked; d2 unchecked
    const d1 = await screen.findByRole('checkbox', { name: /FE Cohort/i });
    const d2 = screen.getByRole('checkbox', { name: /BE Cohort/i });
    expect(d1).toBeChecked();
    expect(d2).not.toBeChecked();
    // uncheck d1 (→ unassign), check d2 (→ assign)
    await user.click(d1);
    await user.click(d2);
    await user.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fm = fetch as unknown as ReturnType<typeof vi.fn>;
    const post = fm.mock.calls.find(([u, o]) => typeof u === 'string' && u.includes('/institutes/i1/drives') && (o as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ driveIds: ['d2'] });   // added
    expect(fm.mock.calls.some(([u, o]) => typeof u === 'string' && u.includes('/institutes/i1/drives/d1') && (o as RequestInit | undefined)?.method === 'DELETE')).toBe(true);  // removed
  });
});
