import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { Interviews } from '../pages/Portal/Interviews.js';
import { Offers } from '../pages/Portal/Offers.js';
import { ThemeProvider } from '../theme/ThemeContext.js';

const INTERVIEWS_PAYLOAD = {
  items: [
    {
      interviewId: 'iv1', company: 'Acme Corp', driveName: 'CSE Drive',
      date: '2026-08-05T00:00:00.000Z', start: '10:00', end: '10:30', time: '10:00 AM',
      status: 'Scheduled', interviewers: ['Jane Doe'], link: 'https://meet.example.com/abc',
    },
  ],
};

const OFFERS_PAYLOAD = {
  items: [
    {
      applicationId: 'o1', company: 'Acme Corp', driveName: 'CSE Drive',
      status: 'Sent', response: 'Pending', ctc: 1200000, location: 'Bengaluru', mode: 'Hybrid',
      joinDate: '2026-09-01T00:00:00.000Z', declineReason: '',
    },
    {
      applicationId: 'o2', company: 'Globex', driveName: 'ECE Drive',
      status: 'Accepted', response: 'Accepted', ctc: 1000000, location: 'Pune', mode: 'Onsite',
      joinDate: '2026-09-15T00:00:00.000Z', declineReason: '',
    },
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

describe('Interviews', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    seedAuth();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => INTERVIEWS_PAYLOAD });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('shows company, drive, status and a Join link pointing at the item link', async () => {
    renderIn(<Interviews />);
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    expect(screen.getByText('CSE Drive')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();

    const join = screen.getByRole('link', { name: 'Join' });
    expect(join).toHaveAttribute('href', 'https://meet.example.com/abc');
    expect(join).toHaveAttribute('target', '_blank');
  });

  it('renders an empty state when there are no interviews', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [] }) });
    renderIn(<Interviews />);
    await waitFor(() => expect(screen.getByText('No interviews scheduled.')).toBeInTheDocument());
  });

  it('omits the Join link when there is no link', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ items: [{ ...INTERVIEWS_PAYLOAD.items[0], link: '' }] }),
    });
    renderIn(<Interviews />);
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Join' })).not.toBeInTheDocument();
  });
});

describe('Offers', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    seedAuth();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => OFFERS_PAYLOAD });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('shows Accept/Decline only for a Sent+Pending offer, and no buttons for an Accepted offer', async () => {
    renderIn(<Offers />);
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();

    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Decline' })).toHaveLength(1);
  });

  it('fires POST …/respond with {response:"Accepted"} on Accept', async () => {
    const user = userEvent.setup();
    renderIn(<Offers />);
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/offers/o1/respond'));
      expect(call).toBeTruthy();
      const init = (call as unknown[])[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ response: 'Accepted' });
    });
  });

  it('reveals a reason input on Decline and posts {response:"Declined", declineReason} on submit', async () => {
    const user = userEvent.setup();
    renderIn(<Offers />);
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Decline' }));
    const input = screen.getByPlaceholderText(/reason/i);
    expect(input).toBeInTheDocument();
    await user.type(input, 'Accepted another offer');

    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Confirm decline' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/offers/o1/respond'));
      expect(call).toBeTruthy();
      const init = (call as unknown[])[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ response: 'Declined', declineReason: 'Accepted another offer' });
    });
  });

  it('renders an empty state when there are no offers', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [] }) });
    renderIn(<Offers />);
    await waitFor(() => expect(screen.getByText('No offers yet.')).toBeInTheDocument());
  });
});
