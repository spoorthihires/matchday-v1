import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TemplateCards } from '../pages/Templates/TemplateCards.js';
import { TemplateTable } from '../pages/Templates/TemplateTable.js';
import { baseSections } from '../pages/Templates/templateUtils.js';
import type { TemplateItem } from '../types/templates.js';

const item = (over: Partial<TemplateItem> = {}): TemplateItem => ({
  id: 't1', code: 'TPL-ABC', name: 'Data Analyst', domain: 'Data / Analytics',
  status: 'Active', usedBy: 6, sections: baseSections(), version: '2.1', versions: [],
  createdAt: '2026-05-30T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z', ...over,
});

describe('TemplateCards / TemplateTable', () => {
  it('renders a card with name, version, used-by, and section counts', () => {
    render(<TemplateCards items={[item()]} onAction={() => {}} />);
    expect(screen.getByText('Data Analyst')).toBeInTheDocument();
    expect(screen.getByText('v2.1')).toBeInTheDocument();
    // getByText matches direct text nodes only (TL's getNodeText), so target the unique tsec
    // labels — the numeric counts live in <b> children and repeat (3 appears for assess + priv).
    expect(screen.getByText(/Used by/i)).toHaveTextContent('Used by 6 drives');
    expect(screen.getByText(/match rules/i)).toBeInTheDocument();   // "4 match rules"
    expect(screen.getByText(/privacy rules/i)).toBeInTheDocument();  // "3 privacy rules"
    expect(screen.getByText(/stages/i)).toBeInTheDocument();         // "9 stages"
  });

  it('renders an inactive card dimmed and shows the Activate option in its kebab', async () => {
    const onAction = vi.fn();
    const { container } = render(<TemplateCards items={[item({ status: 'Inactive' })]} onAction={onAction} />);
    expect(container.querySelector('.tpl-card')).toHaveClass('inactive');
    const user = userEvent.setup();
    await user.click(screen.getByTitle('More'));
    expect(screen.getByText(/Activate/)).toBeInTheDocument();
    await user.click(screen.getByText(/Clone template/));
    expect(onAction).toHaveBeenCalledWith('clone', expect.objectContaining({ id: 't1' }));
  });

  it('renders the table row with the TPL code and domain', () => {
    render(<TemplateTable items={[item()]} onAction={() => {}} />);
    expect(screen.getByText('TPL-ABC')).toBeInTheDocument();
    expect(screen.getByText('Data / Analytics')).toBeInTheDocument();
  });
});
