import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { BulkAssignDrivesModal } from '../pages/Institutes/BulkAssignDrivesModal.js';

const ALL_DRIVES = { items: [
  { id: 'd1', name: 'FE Cohort', domain: 'Web', stream: 'B.Tech', month: 'Jul 2026', frequency: 'One-time', eventDay: 'Wednesday', candCap: 1, empCap: 1, slotCap: 1, status: 'Active', createdBy: 'A', primaryEventDate: null },
], total: 1, page: 1, limit: 100 };

function renderModal(onClose = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AuthProvider><BulkAssignDrivesModal instituteIds={['i1', 'i2']} onClose={onClose} /></AuthProvider></QueryClientProvider>);
}

describe('BulkAssignDrivesModal', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/drives') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ALL_DRIVES });
      if (url.includes('/institutes/assign-drives') && method === 'POST') return Promise.resolve({ ok: true, status: 200, json: async () => ({ assigned: 2 }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('assigns the checked drives to all selected institutes', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: /FE Cohort/i }));
    await user.click(screen.getByRole('button', { name: /Assign to 2 institutes/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fm = fetch as unknown as ReturnType<typeof vi.fn>;
    const post = fm.mock.calls.find(([u, o]) => typeof u === 'string' && u.includes('/institutes/assign-drives') && (o as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ instituteIds: ['i1', 'i2'], driveIds: ['d1'] });
  });
});
