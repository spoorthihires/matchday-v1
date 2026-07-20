import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerSlots } from '../pages/EmployerPortal/EmployerSlots.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({
    token: 't', user: { id: 'e1', name: 'Acme Corp', email: 'e@c.com', role: 'employer' },
  }));
}

const DRIVE = {
  id: 'd1', name: 'Data Analyst MatchDay', domain: 'Data / ML', stream: 'B.Tech', month: 'Aug 2026',
  primaryEventDate: '2026-08-05T00:00:00.000Z', eventDates: ['2026-08-05T00:00:00.000Z', '2026-08-12T00:00:00.000Z'],
  candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday', status: 'Active',
  employerReg: 'Open', canRegister: true,
  eligibility: { sources: [], branches: [], gradYears: [], expType: '' }, evaluation: [], streamId: null,
};
const SLOT = { id: 's1', date: '2026-08-05T00:00:00.000Z', start: '10:00', end: '12:00', capacity: 8, booked: 0, status: 'Scheduled', link: 'https://meet.hiringhood.test/s1' };

// Routes GET drive / GET slots / POST slot / DELETE slot by URL+method. `slots` starts with
// whatever the test seeds; POST appends; DELETE empties.
function mockFetch(initialSlots: unknown[]) {
  let slots = [...initialSlots];
  const post = vi.fn();
  const del = vi.fn();
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    const method = opts.method ?? 'GET';
    if (url.includes('/drives/d1/slots') && method === 'POST') {
      post(JSON.parse(opts.body as string));
      const created = { ...SLOT, id: 's2', start: '14:00', end: '16:00' };
      slots = [...slots, created];
      return { ok: true, status: 201, json: async () => created };
    }
    if (url.match(/\/drives\/d1\/slots\/[^/]+$/) && method === 'DELETE') {
      del(url); slots = [];
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (url.includes('/drives/d1/slots')) return { ok: true, status: 200, json: async () => ({ items: slots }) };
    if (url.includes('/drives/d1')) return { ok: true, status: 200, json: async () => DRIVE };
    return { ok: false, status: 404, json: async () => ({ error: { message: 'nope', code: 'not_found' } }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { post, del };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/drives/d1/slots']}>
        <AuthProvider>
          <Routes><Route path="/employer/drives/:id/slots" element={<EmployerSlots />} /></Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerSlots', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders the drive name and existing slots', async () => {
    seedAuth(); mockFetch([SLOT]); renderPage();
    await waitFor(() => expect(screen.getByText(/Data Analyst MatchDay/)).toBeInTheDocument());
    expect(screen.getByText('10:00 – 12:00')).toBeInTheDocument();
  });

  it('the date select is limited to the drive event dates', async () => {
    seedAuth(); mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Date/i)).toBeInTheDocument());
    const select = screen.getByLabelText(/Date/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value).filter(Boolean);
    expect(values).toEqual(['2026-08-05T00:00:00.000Z', '2026-08-12T00:00:00.000Z']);
  });

  it('blocks submit and shows an error when the date is empty', async () => {
    seedAuth(); const { post } = mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Add slot/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add slot/i }));
    const field = screen.getByLabelText(/Date/i).closest('.field') as HTMLElement;
    await waitFor(() => expect(field).toHaveClass('show-err'));
    expect(post).not.toHaveBeenCalled();
  });

  it('submits a valid slot with the expected body', async () => {
    seedAuth(); const { post } = mockFetch([]); renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Date/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '2026-08-05T00:00:00.000Z' } });
    fireEvent.change(screen.getByLabelText(/Start/i), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText(/End/i), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText(/Capacity/i), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: /Add slot/i }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toMatchObject({ date: '2026-08-05T00:00:00.000Z', start: '14:00', end: '16:00', capacity: 8, linkMode: 'auto' });
  });

  it('cancels (deletes) a slot', async () => {
    seedAuth(); const { del } = mockFetch([SLOT]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByText('10:00 – 12:00')).toBeInTheDocument());
    const row = screen.getByText('10:00 – 12:00').closest('.slot-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Cancel/i }));
    await waitFor(() => expect(del).toHaveBeenCalled());
  });
});
