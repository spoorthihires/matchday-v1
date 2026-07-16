import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EvalConfigCards } from '../pages/Evaluations/EvalConfigCards.js';
import type { EvalConfigItem } from '../types/evaluations.js';

const item = (over: Partial<EvalConfigItem> = {}): EvalConfigItem => ({
  id: 'e1', code: 'EVC-ABC', name: 'Standard MCQ round', type: 'MCQ', enabled: true,
  passing: 60, attempts: 2, retake: 'After cooldown', cooldown: 2, validity: 90,
  autoQual: true, threshold: 70, contests: 8, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-07-12T00:00:00.000Z', ...over,
});

describe('EvalConfigCards', () => {
  it('renders tiles, type chip, and contest count', () => {
    render(<EvalConfigCards items={[item()]} onAction={() => {}} onToggle={() => {}} />);
    expect(screen.getByText('Standard MCQ round')).toBeInTheDocument();
    expect(screen.getByText('MCQ')).toBeInTheDocument();
    expect(screen.getByText(/Assigned to/)).toHaveTextContent('Assigned to 8 contests');
    expect(screen.getByText(/≥ 70%/)).toBeInTheDocument();     // auto-qualify tile
  });
  it('inline toggle fires onToggle; disabled card is dimmed', async () => {
    const onToggle = vi.fn();
    const { container } = render(<EvalConfigCards items={[item({ enabled: false })]} onAction={() => {}} onToggle={onToggle} />);
    expect(container.querySelector('.tpl-card')).toHaveClass('ev-off');
    await userEvent.setup().click(screen.getByTitle(/enable \/ disable/i));
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
  });
  it('kebab delete fires onAction', async () => {
    const onAction = vi.fn();
    render(<EvalConfigCards items={[item()]} onAction={onAction} onToggle={() => {}} />);
    const user = userEvent.setup();
    await user.click(screen.getByTitle('More'));
    await user.click(screen.getByText(/Delete/));
    expect(onAction).toHaveBeenCalledWith('delete', expect.objectContaining({ id: 'e1' }));
  });
});
