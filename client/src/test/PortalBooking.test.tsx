import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { DrivesList } from '../pages/Portal/DrivesList.js';
import { ThemeProvider } from '../theme/ThemeContext.js';
import type { PortalDrive } from '../types/portal.js';

const DRIVE: PortalDrive = {
  id: 'd1', name: 'CSE Drive', domain: 'Backend',
  employers: ['Acme Corp'], eventDates: ['2026-08-05T04:30:00.000Z'], statusTag: 'Selected',
};

const SLOTS_PAYLOAD = {
  items: [
    { id: 's1', date: '2026-08-05T00:00:00.000Z', start: '10:00', end: '10:30', capacity: 2, booked: 0, mine: false },
    { id: 's2', date: '2026-08-05T00:00:00.000Z', start: '11:00', end: '11:30', capacity: 2, booked: 1, mine: true },
    { id: 's3', date: '2026-08-05T00:00:00.000Z', start: '12:00', end: '12:30', capacity: 1, booked: 1, mine: false },
  ],
};

function renderIn(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter><AuthProvider>{ui}</AuthProvider></MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: '1', name: 'Aarav Kumar', email: 'a@b.c', role: 'jobseeker' } }));
}

describe('DrivesList slot booking', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    seedAuth();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => SLOTS_PAYLOAD });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('does not fetch slots until View slots is opened', async () => {
    renderIn(<DrivesList drives={[DRIVE]} />);
    expect(screen.getByText('CSE Drive')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads and shows the slots after clicking View slots', async () => {
    const user = userEvent.setup();
    renderIn(<DrivesList drives={[DRIVE]} />);

    await user.click(screen.getByRole('button', { name: 'View slots' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/portal/drives/d1/slots'));
      expect(call).toBeTruthy();
    });
    await waitFor(() => expect(screen.getByText('10:00–10:30')).toBeInTheDocument());
    expect(screen.getByText('11:00–11:30')).toBeInTheDocument();
    expect(screen.getByText('12:00–12:30')).toBeInTheDocument();
  });

  it('fires POST …/slots/:slotId/book when a bookable slot’s Book button is clicked', async () => {
    const user = userEvent.setup();
    renderIn(<DrivesList drives={[DRIVE]} />);
    await user.click(screen.getByRole('button', { name: 'View slots' }));
    await waitFor(() => expect(screen.getByText('10:00–10:30')).toBeInTheDocument());

    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Book' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/slots/s1/book'));
      expect(call).toBeTruthy();
      const init = (call as unknown[])[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(init.body).toBeUndefined();
    });
  });

  it('fires DELETE …/slots/:slotId/book when the mine slot’s Cancel button is clicked', async () => {
    const user = userEvent.setup();
    renderIn(<DrivesList drives={[DRIVE]} />);
    await user.click(screen.getByRole('button', { name: 'View slots' }));
    await waitFor(() => expect(screen.getByText('11:00–11:30')).toBeInTheDocument());

    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/slots/s2/book'));
      expect(call).toBeTruthy();
      const init = (call as unknown[])[1] as RequestInit;
      expect(init.method).toBe('DELETE');
      expect(init.body).toBeUndefined();
    });
  });

  it('shows Full with no Book button for a slot that is at capacity and not mine', async () => {
    const user = userEvent.setup();
    renderIn(<DrivesList drives={[DRIVE]} />);
    await user.click(screen.getByRole('button', { name: 'View slots' }));
    await waitFor(() => expect(screen.getByText('12:00–12:30')).toBeInTheDocument());

    const fullRow = screen.getByText('12:00–12:30').closest('.drive') as HTMLElement;
    expect(fullRow).toBeTruthy();
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Book' })).toHaveLength(1);
  });
});
