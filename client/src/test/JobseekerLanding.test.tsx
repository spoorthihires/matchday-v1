import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../theme/ThemeContext.js';
import { JobseekerLanding } from '../pages/JobseekerLanding/JobseekerLanding.js';

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <JobseekerLanding />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('JobseekerLanding', () => {
  it('renders the hero headline', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /Your next job, matched in one week/i })).toBeInTheDocument();
  });

  it('renders a Log in link that routes to /login', () => {
    renderPage();
    const loginLinks = screen.getAllByRole('link', { name: /Log in/i });
    expect(loginLinks.length).toBeGreaterThan(0);
    loginLinks.forEach((link) => expect(link).toHaveAttribute('href', '/login'));
  });

  it('renders a Join free link that routes to /jobseekers/signup', () => {
    renderPage();
    const joinLinks = screen.getAllByRole('link', { name: /Join free/i });
    expect(joinLinks.length).toBeGreaterThan(0);
    joinLinks.forEach((link) => expect(link).toHaveAttribute('href', '/jobseekers/signup'));
  });

  it('renders at least one marketing section heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /Choose the stream that fits you/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /A hiring event built around you/i })).toBeInTheDocument();
  });
});
