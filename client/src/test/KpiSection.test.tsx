import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KpiSection } from '../pages/Dashboard/KpiSection.js';
import type { DashboardOverview } from '../types/dashboard.js';

const kpis: DashboardOverview['kpis'] = [
  { key: 'activeDrives', label: 'Active Drives', group: 'Demand', value: 12, display: '12', delta: { value: 2, direction: 'up', display: '+2' } },
  { key: 'joined', label: 'Joined Jobseekers', group: 'Outcomes', value: 41, display: '41', delta: { value: 12, direction: 'up', display: '+12' } },
];

describe('KpiSection', () => {
  it('renders KPI rows with values and deltas', () => {
    render(<KpiSection kpis={kpis} />);
    expect(screen.getByText('Active Drives')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('Joined Jobseekers')).toBeInTheDocument();
  });
});
