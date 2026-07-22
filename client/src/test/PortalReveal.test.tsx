import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { RevealRequests } from '../pages/Portal/RevealRequests.js';
import { ThemeProvider } from '../theme/ThemeContext.js';

const PAYLOAD = {
  items: [
    { applicationId: 'a1', company: 'Acme Corp', driveName: 'CSE Drive', status: 'requested', expired: false, requestedAt: '2026-07-01T00:00:00.000Z', expiresAt: '2026-07-10T00:00:00.000Z', respondedAt: null },
    { applicationId: 'a2', company: 'Globex', driveName: 'ECE Drive', status: 'granted', expired: false, requestedAt: '2026-06-01T00:00:00.000Z', expiresAt: '2026-06-10T00:00:00.000Z', respondedAt: '2026-06-02T00:00:00.000Z' },
    { applicationId: 'a3', company: 'Initech', driveName: 'IT Drive', status: 'requested', expired: true, requestedAt: '2026-05-01T00:00:00.000Z', expiresAt: '2026-05-10T00:00:00.000Z', respondedAt: null },
  ],
};

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter><AuthProvider><RevealRequests /></AuthProvider></MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('RevealRequests', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: '1', name: 'Aarav Kumar', email: 'a@b.c', role: 'jobseeker' } }));
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => PAYLOAD });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('shows Grant/Deny for an actionable request, a Shared badge for granted, and Expired for an expired request', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    // actionable row
    expect(screen.getByRole('button', { name: 'Grant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument();

    // granted row: badge, no buttons
    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();

    // expired row: label, no buttons
    expect(screen.getByText('Initech')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();

    expect(screen.getAllByRole('button', { name: 'Grant' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Deny' })).toHaveLength(1);
  });

  it('shows an inline confirm on Grant and fires POST …/respond with {decision:"grant"} on confirm', async () => {
    const user = userEvent.setup();
    renderSection();
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Grant' }));
    expect(screen.getByText(/Share your name/)).toBeInTheDocument();

    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/reveal-requests/a1/respond'));
      expect(call).toBeTruthy();
      const init = (call as unknown[])[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ decision: 'grant' });
    });
  });

  it('fires POST …/respond with {decision:"deny"} on Deny', async () => {
    const user = userEvent.setup();
    renderSection();
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Deny' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/reveal-requests/a1/respond'));
      expect(call).toBeTruthy();
      const init = (call as unknown[])[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ decision: 'deny' });
    });
  });

  it('renders an empty state when there are no items', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [] }) });
    renderSection();
    await waitFor(() => expect(screen.getByText('No identity reveal requests.')).toBeInTheDocument());
  });
});
