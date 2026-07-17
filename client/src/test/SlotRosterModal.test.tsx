import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { SlotRosterModal } from '../pages/Slots/SlotRosterModal.js';
import type { EligibleResponse, SlotItem, SlotRoster } from '../types/slots.js';

const SLOT: SlotItem = {
  id: 'slot-1', driveId: 'drive-1', driveName: 'Backend · July Cohort',
  employerId: null, employerName: '(Unallocated)',
  date: '2026-07-15T00:00:00.000Z', start: '10:00', end: '12:00',
  capacity: 10, booked: 1, held: 1, status: 'Scheduled', link: '',
  attended: 0, noShow: 0,
};

const ROSTER: SlotRoster = {
  booked: [
    { bookingId: 'b1', jobseekerId: 'j1', name: 'Booked One', institute: 'IIT', branch: 'CSE', stage: 'MatchReady', status: 'Booked' },
  ],
  held: [
    { bookingId: 'b2', jobseekerId: 'j2', name: 'Held One', institute: 'IIT', branch: 'CSE', stage: 'MatchReady', status: 'Held' },
  ],
};

const ELIGIBLE: EligibleResponse = {
  items: [
    { id: 'j3', name: 'Pickable', institute: 'IIT', branch: 'CSE', stage: 'MatchReady' },
  ],
};

function renderModal(onClose: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <SlotRosterModal slot={SLOT} onClose={onClose} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('SlotRosterModal', () => {
  beforeEach(() => {
    localStorage.clear();
    // Seed a logged-in session so useSlotRoster's/useEligibleCandidates' `enabled: !!token` fires
    // (mirrors AuthContext's STORAGE_KEY/readStored shape — see SlotModal.test.tsx).
    localStorage.setItem('matchday.auth', JSON.stringify({
      token: 'test-token',
      user: { id: 'u1', name: 'Test Admin', email: 'admin@matchday.io', role: 'admin' },
    }));

    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/bookings') && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ROSTER });
      }
      if (url.includes('/eligible-candidates') && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ELIGIBLE });
      }
      if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders booked + held rosters and books an eligible candidate', async () => {
    renderModal(vi.fn());

    expect(await screen.findByText(/Booked One/)).toBeTruthy();
    expect(screen.getByText(/Held One/)).toBeTruthy();
    expect(await screen.findByText(/Pickable/)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Book' }));

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, o]) => typeof u === 'string' && u.includes('/bookings') && (o as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
    const postCall = fetchMock.mock.calls.find(
      ([u, o]) => typeof u === 'string' && u.includes('/bookings') && (o as RequestInit | undefined)?.method === 'POST',
    )!;
    const [postUrl, postOpts] = postCall;
    expect(postUrl).toContain(`/slots/${SLOT.id}/bookings`);
    const body = JSON.parse((postOpts as RequestInit).body as string);
    expect(body).toEqual({ jobseekerId: 'j3', status: 'Booked' });
  });

  it('confirms a held booking and releases a booking', async () => {
    renderModal(vi.fn());

    await screen.findByText(/Held One/);
    await screen.findByText(/Booked One/);

    const user = userEvent.setup();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, o]) => typeof u === 'string' && u.includes('/bookings/b2') && (o as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
    });
    const patchCall = fetchMock.mock.calls.find(
      ([u, o]) => typeof u === 'string' && u.includes('/bookings/b2') && (o as RequestInit | undefined)?.method === 'PATCH',
    )!;
    const [patchUrl, patchOpts] = patchCall;
    expect(patchUrl).toContain(`/slots/${SLOT.id}/bookings/b2`);
    expect(JSON.parse((patchOpts as RequestInit).body as string)).toEqual({ status: 'Booked' });

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        ([u, o]) => typeof u === 'string' && u.includes('/bookings/b1') && (o as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(deleteCall).toBeTruthy();
    });
  });
});
