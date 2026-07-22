import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { JobseekerSignup } from '../pages/JobseekerLanding/JobseekerSignup.js';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/jobseekers/signup']}>
        <AuthProvider>
          <Routes>
            <Route path="/jobseekers/signup" element={<JobseekerSignup />} />
            <Route path="/portal" element={<div>PORTAL HOME</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockFetch() {
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes('/auth/institutes')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ items: [{ id: 'i1', name: 'Acme University' }] }),
      });
    }
    if (String(url).includes('/auth/jobseeker-signup')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({
          token: 't',
          user: { id: 'j1', name: 'X', email: 'x@x.test', role: 'jobseeker' },
        }),
      });
    }
    if (String(url).includes('/auth/login')) {
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({
          token: 't-login',
          user: { id: 'j1', name: 'X', email: 'x@x.test', role: 'jobseeker' },
        }),
      });
    }
    return Promise.reject(new Error(`unexpected fetch url: ${url}`));
  });
  return fetchMock;
}

describe('JobseekerSignup', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('populates the institute select from GET /auth/institutes', async () => {
    mockFetch();
    renderPage();
    await waitFor(() => expect(screen.getByText('Acme University')).toBeInTheDocument());
  });

  it('submits the entered fields to POST /auth/jobseeker-signup and navigates to /portal', async () => {
    const fetchMock = mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Acme University')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Full name'), 'X');
    await userEvent.type(screen.getByLabelText('Email'), 'x@x.test');
    await userEvent.type(screen.getByLabelText('Password'), 'Password123');
    await userEvent.selectOptions(screen.getByLabelText('Institute'), 'i1');
    await userEvent.type(screen.getByLabelText('Branch'), 'CSE');
    await userEvent.type(screen.getByLabelText('Graduation year'), '2026');
    await userEvent.type(screen.getByLabelText('How did you hear about us?'), 'LinkedIn');
    await userEvent.type(screen.getByLabelText('CGPA'), '8.5');

    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(screen.getByText('PORTAL HOME')).toBeInTheDocument());

    const signupCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/auth/jobseeker-signup'));
    expect(signupCall).toBeTruthy();
    const body = JSON.parse((signupCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      name: 'X',
      email: 'x@x.test',
      password: 'Password123',
      instituteId: 'i1',
      branch: 'CSE',
      gradYear: 2026,
      source: 'LinkedIn',
      cgpa: 8.5,
    });
  });

  it('surfaces a submit error via role=alert without navigating', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/auth/institutes')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({ items: [{ id: 'i1', name: 'Acme University' }] }),
        });
      }
      if (String(url).includes('/auth/jobseeker-signup')) {
        return Promise.resolve({
          ok: false, status: 400,
          json: async () => ({ error: { message: 'An account with this email already exists', code: 'validation' } }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch url: ${url}`));
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Acme University')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Full name'), 'X');
    await userEvent.type(screen.getByLabelText('Email'), 'x@x.test');
    await userEvent.type(screen.getByLabelText('Password'), 'Password123');
    await userEvent.selectOptions(screen.getByLabelText('Institute'), 'i1');
    await userEvent.type(screen.getByLabelText('Branch'), 'CSE');
    await userEvent.type(screen.getByLabelText('Graduation year'), '2026');
    await userEvent.type(screen.getByLabelText('How did you hear about us?'), 'LinkedIn');
    await userEvent.type(screen.getByLabelText('CGPA'), '8.5');

    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('An account with this email already exists'));
    expect(screen.queryByText('PORTAL HOME')).not.toBeInTheDocument();
  });
});
