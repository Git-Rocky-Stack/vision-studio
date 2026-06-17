import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverBudgetFallbackDialog } from './OverBudgetFallbackDialog';

describe('OverBudgetFallbackDialog', () => {
  it('offers each capable candidate plus run-locally and cancel', () => {
    const onRouteTo = vi.fn();
    const onRunLocally = vi.fn();
    const onCancel = vi.fn();
    render(
      <OverBudgetFallbackDialog
        open
        candidates={['openrouter', 'huggingface']}
        onRouteTo={onRouteTo}
        onRunLocally={onRunLocally}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('fallback-route-huggingface'));
    expect(onRouteTo).toHaveBeenCalledWith('huggingface');
    fireEvent.click(screen.getByTestId('fallback-run-locally'));
    expect(onRunLocally).toHaveBeenCalled();
  });

  it('shows a no-fallback note when there are no candidates', () => {
    render(
      <OverBudgetFallbackDialog
        open
        candidates={[]}
        onRouteTo={vi.fn()}
        onRunLocally={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('fallback-no-candidates')).toBeInTheDocument();
  });
});
