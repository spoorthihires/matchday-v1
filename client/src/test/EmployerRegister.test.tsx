import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerRegister } from '../pages/EmployerPortal/EmployerRegister.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({
    token: 't', user: { id: 'e1', name: 'Acme Corp', email: 'employer@company.com', role: 'employer' },
  }));
}

const DRIVE_DETAIL = {
  id: 'd1', name: 'ActiveOne', domain: 'Frontend', stream: 'B.Tech', month: 'Aug 2026',
  primaryEventDate: '2026-08-05T00:00:00.000Z', eventDates: ['2026-08-05T00:00:00.000Z'],
  candCap: 100, empCap: 8, slotCap: 20, frequency: 'Weekly', eventDay: 'Wednesday',
  status: 'Active', employerReg: 'Open', canRegister: true,
  eligibility: { sources: ['Institutes'], branches: ['CSE'], gradYears: [2026], expType: 'Freshers only' },
  evaluation: [{ key: 'mcq', enabled: true, config: {} }],
  streamId: 's1',
};

const POST_SUCCESS_BODY = { id: 'r1', status: 'Pending review', driveName: 'ActiveOne', role: 'Data Analyst' };
const ALREADY_REGISTERED_BODY = {
  error: { message: 'You already have an active registration for this drive', code: 'already_registered' },
};

function mockFetch({ postStatus = 201, postBody = POST_SUCCESS_BODY as unknown } = {}) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (String(url).includes('/me/employer/drives/d1') && method === 'GET') {
      return Promise.resolve({ ok: true, status: 200, json: async () => DRIVE_DETAIL });
    }
    if (String(url).includes('/me/employer/registrations') && method === 'POST') {
      return Promise.resolve({
        ok: postStatus < 400,
        status: postStatus,
        json: async () => (postStatus < 400 ? postBody : ALREADY_REGISTERED_BODY),
      });
    }
    return Promise.reject(new Error(`unexpected fetch url: ${url} ${method}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(path = '/employer/drives/d1/register') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/employer/drives/:id/register" element={<EmployerRegister />} />
            <Route path="/employer/drives/:id" element={<div>DRIVE DETAIL PAGE</div>} />
            <Route path="/employer/registrations" element={<div>REGISTRATIONS TRACKER</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function completeUpToReview() {
  // Step 1: Role & JD
  await userEvent.type(screen.getByLabelText('Role title'), 'Data Analyst');
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));

  // Step 2: Eligibility
  await userEvent.type(screen.getByLabelText('Must-have skills'), 'SQL{enter}');
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));

  // Step 3: Compensation
  await userEvent.clear(screen.getByLabelText('CTC min (LPA)'));
  await userEvent.type(screen.getByLabelText('CTC min (LPA)'), '6');
  await userEvent.clear(screen.getByLabelText('CTC max (LPA)'));
  await userEvent.type(screen.getByLabelText('CTC max (LPA)'), '10');
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));

  // Step 4: Location
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));

  // Step 5: Schedule
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));

  // Step 6: Evaluation
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));
}

describe('EmployerRegister', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('blocks Next on step 1 when the required role field is empty', async () => {
    seedAuth();
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByText('Enter a role title.')).toBeInTheDocument();
    const roleField = screen.getByLabelText('Role title').closest('.field');
    expect(roleField).not.toBeNull();
    expect(roleField).toHaveClass('show-err');
    // still on step 1: step 3's field must not be present
    expect(screen.queryByLabelText('CTC min (LPA)')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/me/employer/registrations'), expect.anything());
  });

  it('shows the JD-prefill banner on input steps, but not on the role step or the review step', async () => {
    seedAuth();
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    // Step 1 (role & JD): no banner yet
    expect(screen.queryByText(/Fields pre-filled from your JD/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Role title'), 'Data Analyst');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Step 2 (eligibility): banner shows
    expect(screen.getByText(/Fields pre-filled from your JD/i)).toBeInTheDocument();

    // advance through the remaining input steps (3-6) to reach the review step
    await userEvent.type(screen.getByLabelText('Must-have skills'), 'SQL{enter}');
    await userEvent.click(screen.getByRole('button', { name: /continue/i })); // -> step 3
    await userEvent.clear(screen.getByLabelText('CTC min (LPA)'));
    await userEvent.type(screen.getByLabelText('CTC min (LPA)'), '6');
    await userEvent.clear(screen.getByLabelText('CTC max (LPA)'));
    await userEvent.type(screen.getByLabelText('CTC max (LPA)'), '10');
    await userEvent.click(screen.getByRole('button', { name: /continue/i })); // -> step 4
    await userEvent.click(screen.getByRole('button', { name: /continue/i })); // -> step 5
    await userEvent.click(screen.getByRole('button', { name: /continue/i })); // -> step 6
    await userEvent.click(screen.getByRole('button', { name: /continue/i })); // -> step 7

    // Step 7 (review & submit): banner hidden again
    expect(screen.queryByText(/Fields pre-filled from your JD/i)).not.toBeInTheDocument();
  });

  it('completes all steps, POSTs the expected body, and shows the success screen', async () => {
    const fetchMock = mockFetch();
    seedAuth();
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    await completeUpToReview();

    // Step 7: Review + submit
    await userEvent.click(screen.getByRole('button', { name: /submit registration/i }));

    await waitFor(() => expect(screen.getByText('Registration submitted')).toBeInTheDocument());

    const postCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes('/me/employer/registrations') && (c[1] as RequestInit)?.method === 'POST',
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      driveId: 'd1',
      role: 'Data Analyst',
      ctcMin: 6,
      ctcMax: 10,
      mustHave: ['SQL'],
    });
    expect(body.details).toBeTruthy();
    expect(body.company).toBeUndefined();
    expect(body.employerId).toBeUndefined();
  });

  it('shows the already_registered error inline on a 400', async () => {
    seedAuth();
    mockFetch({ postStatus: 400 });
    renderPage();

    await waitFor(() => expect(screen.getByText('ActiveOne')).toBeInTheDocument());
    await completeUpToReview();

    await userEvent.click(screen.getByRole('button', { name: /submit registration/i }));

    await waitFor(() => expect(
      screen.getByText('You already have an active registration for this drive'),
    ).toBeInTheDocument());
    // still on the review step, not the success screen
    expect(screen.queryByText('Registration submitted')).not.toBeInTheDocument();
  });
});
