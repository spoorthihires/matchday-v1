import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { SlotsPage } from '../pages/Slots/index.js';
import { ThemeProvider } from '../theme/ThemeContext.js';

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[url]}>
        <QueryClientProvider client={qc}><AuthProvider><SlotsPage /></AuthProvider></QueryClientProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('SlotsPage — ?employerId= deep-link', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/employers')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [{ id: 'emp-1', name: 'Nexatech', industry: 'x', size: '51–200', spoc: '', email: '', status: 'Active', activeDrives: 0, candidatesViewed: 0, shortlistRate: 0, offerRate: 0, respHours: 0 }], total: 1, page: 1, limit: 100 }) });
      if (url.includes('/slots')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [] }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('initializes the employer filter from ?employerId= so the slots query is pre-filtered', async () => {
    renderAt('/slots?employerId=emp-1');
    await waitFor(() => {
      const fm = fetch as unknown as ReturnType<typeof vi.fn>;
      const slotCall = fm.mock.calls.find(([u]) => typeof u === 'string' && u.includes('/slots') && u.includes('employerId=emp-1'));
      expect(slotCall).toBeTruthy();
    });
  });
});
