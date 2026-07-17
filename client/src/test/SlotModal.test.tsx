import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { SlotModal } from '../pages/Slots/SlotModal.js';
import type { DriveListResponse } from '../types/drives.js';
import type { EmployerListResponse } from '../types/employers.js';
import type { SlotItem } from '../types/slots.js';

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

const SLOT: SlotItem = {
  id: 'slot-1', driveId: 'drive-1', driveName: 'Backend · July Cohort',
  employerId: null, employerName: '(Unallocated)',
  date: '2026-07-15T00:00:00.000Z', start: '10:00', end: '12:00',
  capacity: 10, booked: 6, held: 1, status: 'Scheduled', link: '',
  attended: 0, noShow: 0,
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

function renderEditModal(onClose: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <SlotModal mode="edit" slot={SLOT} onClose={onClose} />
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

  it('create payload does not include booked (derived server-side, no longer a form input)', async () => {
    const onClose = vi.fn();
    renderModal(onClose);

    // Wait for the drive select to auto-populate from useDrives — confirms both list queries
    // resolved (SlotModal defaults create mode to the first non-Archived drive, mirroring the
    // prototype's openSlotCreate `drives[0]?.name || ''`). All other required fields (date/start/
    // end) already carry defaults, so the form is submittable as soon as driveId is set.
    await screen.findByRole('option', { name: 'Backend · July Cohort' });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /save slot/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const postCall = fetchMock.mock.calls.find(
      ([u, o]) => typeof u === 'string' && u.includes('/slots') && (o as RequestInit | undefined)?.method === 'POST',
    );
    expect(postCall).toBeTruthy();
    const [postUrl, postOpts] = postCall!;
    expect(postUrl).toContain('/slots');
    const body = JSON.parse((postOpts as RequestInit).body as string);
    expect(body).not.toHaveProperty('booked');
    expect(body).not.toHaveProperty('held');
    expect(body).toEqual(expect.objectContaining({
      date: '2026-07-15',
      start: '10:00',
      end: '12:00',
      capacity: 10,
      status: 'Scheduled',
      employerId: null,
      driveId: 'drive-1',
      attended: 0,
      noShow: 0,
    }));
  });

  it('shows booked as a read-only derived "booked / capacity" display in edit mode', async () => {
    renderEditModal(vi.fn());

    await screen.findByRole('option', { name: 'Backend · July Cohort' });

    // The "Booked" <label> here isn't wired to the input via htmlFor/id (it's a plain read-only
    // derived display, not an editable field), so look it up by its rendered value instead of
    // getByLabelText.
    const bookedDisplay = screen.getByDisplayValue('6 / 10') as HTMLInputElement;
    expect(bookedDisplay).toHaveAttribute('readonly');
    expect(bookedDisplay).toBeDisabled();
  });
});
