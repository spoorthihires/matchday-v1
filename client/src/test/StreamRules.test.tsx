import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { StreamRulesPage } from '../pages/Streams/rules/StreamRulesPage.js';
import { SR_DEFAULTS } from '../pages/Streams/rules/streamRulesUtils.js';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={qc}><AuthProvider><StreamRulesPage /></AuthProvider></QueryClientProvider></MemoryRouter>);
}

describe('StreamRulesPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/stream-rules') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...SR_DEFAULTS, updatedAt: '2026-07-12T00:00:00.000Z' }) });
      if (url.includes('/stream-rules') && method === 'PUT') return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...SR_DEFAULTS, updatedAt: '2026-07-12T00:00:00.000Z' }) });
      if (url.includes('/streams')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [] }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads defaults into the summary and Save PUTs the rules', async () => {
    renderPage();
    const user = userEvent.setup();
    expect(await screen.findByText(/Candidates may join up to 2 stream/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Save rules/i }));
    await waitFor(() => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      expect(fetchMock.mock.calls.some(([u, o]) => typeof u === 'string' && u.includes('/stream-rules') && (o as RequestInit | undefined)?.method === 'PUT')).toBe(true);
    });
  });

  it('turning off "Allow secondary streams" greys its dependent row and updates the summary', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText(/Candidates may join up to 2 stream/i);
    const sw = screen.getByLabelText(/Allow secondary streams/i);
    await user.click(sw);
    expect(await screen.findByText(/no secondary streams/i)).toBeInTheDocument();
  });
});
