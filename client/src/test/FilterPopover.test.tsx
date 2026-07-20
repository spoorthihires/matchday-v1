import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterPopover } from '../components/table/filters/FilterPopover.js';

describe('FilterPopover', () => {
  it('shows the summary text on the trigger and opens the body on click', async () => {
    render(
      <FilterPopover summary="Select range" active={false}>
        {() => <div data-testid="body">body</div>}
      </FilterPopover>,
    );
    expect(screen.getByText('Select range')).toBeInTheDocument();
    const user = userEvent.setup();
    expect(screen.queryByTestId('body')).not.toBeInTheDocument();
    await user.click(screen.getByText('Select range'));
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('closes when clicking outside the popover', async () => {
    render(
      <div>
        <FilterPopover summary="Select range" active={false}>
          {() => <div data-testid="body">body</div>}
        </FilterPopover>
        <button>outside</button>
      </div>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('Select range'));
    expect(screen.getByTestId('body')).toBeInTheDocument();
    await user.click(screen.getByText('outside'));
    expect(screen.queryByTestId('body')).not.toBeInTheDocument();
  });

  it('marks the trigger active when a value is set', () => {
    render(
      <FilterPopover summary="100 – 600" active>
        {() => <div>body</div>}
      </FilterPopover>,
    );
    expect(screen.getByText('100 – 600').closest('button')?.className).toContain('active');
  });

  it('passes a close() callback to the body that closes the popover', async () => {
    render(
      <FilterPopover summary="Select range" active={false}>
        {(close) => <button onClick={close}>close me</button>}
      </FilterPopover>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('Select range'));
    expect(screen.getByText('close me')).toBeInTheDocument();
    await user.click(screen.getByText('close me'));
    expect(screen.queryByText('close me')).not.toBeInTheDocument();
  });
});
