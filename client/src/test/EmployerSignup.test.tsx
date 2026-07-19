import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerSignup } from '../pages/EmployerPortal/EmployerSignup.js';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/signup']}>
        <AuthProvider>
          <Routes>
            <Route path="/employer/signup" element={<EmployerSignup />} />
            <Route path="/employer/verify" element={<div>EMPLOYER VERIFY</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillStep1() {
  await userEvent.type(screen.getByLabelText('Company name'), 'Acme Corp');
  await userEvent.selectOptions(screen.getByLabelText('Industry'), 'Fintech');
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));
}

async function fillStep2() {
  await userEvent.type(screen.getByLabelText('Hiring contact name'), 'Asha Nambala');
  await userEvent.type(screen.getByLabelText('Work email'), 'employer@company.com');
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));
}

async function fillStep3() {
  await userEvent.click(screen.getByRole('checkbox', { name: /terms of service/i }));
  await userEvent.click(screen.getByRole('checkbox', { name: /privacy policy/i }));
  await userEvent.type(screen.getByLabelText('Password'), 'Employer123!');
}

describe('EmployerSignup', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('blocks Next on step 1 when required fields are missing', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText('Enter your company name.')).toBeInTheDocument();
    expect(screen.getByText('Select an industry.')).toBeInTheDocument();
    // still on step 1: step 2's field must not be present
    expect(screen.queryByLabelText('Hiring contact name')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('offers only the 4 company sizes the Employer.size Mongoose enum allows', async () => {
    renderPage();
    const options = screen.getAllByRole<HTMLOptionElement>('option', { hidden: true })
      .filter((o) => o.closest('select')?.getAttribute('aria-label') === 'Company size');
    const values = options.map((o) => o.value).filter((v) => v !== '');
    expect(values).toEqual(['1–50', '51–200', '201–1000', '1000+']);
  });

  it('toggles the show-err class on the field wrapper so the CSS-hidden error message becomes visible', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    const nameInput = screen.getByLabelText('Company name');
    const nameField = nameInput.closest('.field');
    expect(nameField).not.toBeNull();
    expect(nameField).toHaveClass('show-err');
  });

  it('posts the expected employer-signup body after completing all 3 steps and navigates to verify', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/auth/employer-signup')) {
        return Promise.resolve({
          ok: true, status: 201,
          json: async () => ({
            token: 't-signup',
            user: { id: '1', name: 'Acme Corp', email: 'employer@company.com', role: 'employer' },
          }),
        });
      }
      if (String(url).includes('/auth/login')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({
            token: 't-login',
            user: { id: '1', name: 'Acme Corp', email: 'employer@company.com', role: 'employer' },
          }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch url: ${url}`));
    });

    renderPage();
    await fillStep1();
    await fillStep2();
    await fillStep3();
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(screen.getByText('EMPLOYER VERIFY')).toBeInTheDocument());

    const signupCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/auth/employer-signup'));
    expect(signupCall).toBeTruthy();
    const body = JSON.parse((signupCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      name: 'Acme Corp',
      industry: 'Fintech',
      spoc: 'Asha Nambala',
      email: 'employer@company.com',
      acceptTerms: true,
      acceptPrivacy: true,
      password: 'Employer123!',
    });

    const loginCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/auth/login'));
    expect(loginCall).toBeTruthy();
  });
});
