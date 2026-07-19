import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { RoleRoute } from '../auth/RoleRoute.js';
import { homePathFor } from '../auth/roles.js';

function seedAuth(role: string) {
  localStorage.setItem('matchday.auth', JSON.stringify({
    token: 't', user: { id: '1', name: 'X', email: 'x@y.z', role },
  }));
}

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/employer/dashboard" element={<RoleRoute role="employer"><div>EMPLOYER DASHBOARD</div></RoleRoute>} />
          <Route path="/" element={<div>ADMIN HOME</div>} />
          <Route path="/portal" element={<div>JOBSEEKER PORTAL</div>} />
          <Route path="/login" element={<div>LOGIN</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('homePathFor', () => {
  it("returns '/employer/dashboard' for the employer role", () => {
    expect(homePathFor('employer')).toBe('/employer/dashboard');
  });

  it("keeps '/portal' for jobseeker and '/' as the default", () => {
    expect(homePathFor('jobseeker')).toBe('/portal');
    expect(homePathFor('admin')).toBe('/');
    expect(homePathFor(undefined)).toBe('/');
  });
});

describe('employer routing (RoleRoute)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('renders the employer dashboard for an authenticated employer', () => {
    seedAuth('employer');
    renderAt('/employer/dashboard');
    expect(screen.getByText('EMPLOYER DASHBOARD')).toBeInTheDocument();
  });

  it('redirects a jobseeker away from /employer/dashboard', () => {
    seedAuth('jobseeker');
    renderAt('/employer/dashboard');
    expect(screen.getByText('JOBSEEKER PORTAL')).toBeInTheDocument();
  });

  it('redirects an admin away from /employer/dashboard', () => {
    seedAuth('admin');
    renderAt('/employer/dashboard');
    expect(screen.getByText('ADMIN HOME')).toBeInTheDocument();
  });

  it('redirects to /login without a token', () => {
    renderAt('/employer/dashboard');
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });
});
