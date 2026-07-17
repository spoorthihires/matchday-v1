import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Toaster } from '../toast/Toaster.js';
import { dismiss, getToasts, toast } from '../toast/toastStore.js';

beforeEach(() => getToasts().slice().forEach((t) => dismiss(t.id)));
afterEach(() => getToasts().slice().forEach((t) => dismiss(t.id)));

describe('Toaster', () => {
  it('renders an error toast with its message + variant class', () => {
    toast.error('save failed');
    render(<Toaster />);
    expect(screen.getByText('save failed')).toBeTruthy();
    expect(document.querySelector('.toast-error')).toBeTruthy();
  });
  it('dismiss button removes the toast', async () => {
    toast.info('hello'); render(<Toaster />);
    await userEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText('hello')).toBeNull();
  });
});
