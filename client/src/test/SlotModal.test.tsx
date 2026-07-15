import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { SlotModal } from '../pages/Slots/SlotModal.js';
import type { DriveListResponse } from '../types/drives.js';
import type { EmployerListResponse } from '../types/employers.js';

const EMPLOYERS_RESPONSE: EmployerListResponse = {
  items: [
    {
      id: 'emp-1', name: 'Vaultline Systems', industry: 'Fintech', size: '51-200',
      spoc: 'A. Khanna', email: 'a@vaultline.io', status: 'Active',
      activeDrives: 1, candidatesViewed: 10, shortlistRate: 20, offerRate: 10, respHours: 5,
    },
  ],
  total: 1, page: 1, limit: 100,
};

const DRIVES_RESPONSE: DriveListResponse = {
  items: [
    {
      id: 'drive-1', name: 'Backend · July Cohort', domain: 'Backend', stream: 'B.Tech',
      month: 'Jul 2026', frequency: 'One-time', eventDay: 'Wednesday',
      candCap: 100, empCap: 5, slotCap: 20, status: 'Published',
      createdBy: 'Platform Admin', primaryEventDate: null,
    },
  ],
  total: 1, page: 1, limit: 100,
};

function renderModal(onClose: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <SlotModal mode="create" date="2026-07-15" onClose={onClose} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('SlotModal', () => {
  beforeEach(() => {
    localStorage.clear();
    // Seed a logged-in session so useEmployers'/useDrives' `enabled: !!token` fires (mirrors
    // AuthContext's STORAGE_KEY/readStored shape — see ApprovalsPage.test.tsx).
    localStorage.setItem('matchday.auth', JSON.stringify({
      token: 'test-token',
      user: { id: 'u1', name: 'Test Admin', email: 'admin@matchday.io', role: 'admin' },
    }));

    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/employers') && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: async () => EMPLOYERS_RESPONSE });
      }
      if (url.includes('/drives') && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: async () => DRIVES_RESPONSE });
      }
      if (url.includes('/slots') && method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 'slot-1' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocks Save when booked exceeds capacity, then saves once fixed', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();

    // Wait for the drive select to auto-populate from useDrives — confirms both list queries
    // resolved (SlotModal defaults create mode to the first non-Archived drive, mirroring the
    // prototype's openSlotCreate `drives[0]?.name || ''`).
    await screen.findByRole('option', { name: 'Backend · July Cohort' });

    const bookedInput = screen.getByLabelText(/booked/i) as HTMLInputElement;
    await user.clear(bookedInput);
    await user.type(bookedInput, '99');

    await user.click(screen.getByRole('button', { name: /save slot/i }));
    expect(await screen.findByText(/booked cannot exceed capacity/i)).toBeInTheDocument();

    // No POST should have fired for the blocked attempt.
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(
      fetchMock.mock.calls.some(([u, o]) => typeof u === 'string' && u.includes('/slots') && (o as RequestInit | undefined)?.method === 'POST'),
    ).toBe(false);

    await user.clear(bookedInput);
    await user.type(bookedInput, '5');
    await user.click(screen.getByRole('button', { name: /save slot/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText(/booked cannot exceed capacity/i)).not.toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(
      ([u, o]) => typeof u === 'string' && u.includes('/slots') && (o as RequestInit | undefined)?.method === 'POST',
    );
    expect(postCall).toBeTruthy();
    const [postUrl, postOpts] = postCall!;
    expect(postUrl).toContain('/slots');
    const body = JSON.parse((postOpts as RequestInit).body as string);
    expect(body).toEqual(expect.objectContaining({
      date: '2026-07-15',
      start: '10:00',
      end: '12:00',
      capacity: 10,
      booked: 5,
      status: 'Scheduled',
      employerId: null,
      driveId: 'drive-1',
      attended: 0,
      noShow: 0,
    }));
  });
});
