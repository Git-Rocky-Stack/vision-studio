import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsentDialog } from './ConsentDialog';

describe('ConsentDialog', () => {
  afterEach(cleanup);

  it('explains the pickle (arbitrary-code) risk and confirms', () => {
    const onConfirm = vi.fn();
    render(
      <ConsentDialog
        open
        kind="pickle"
        modelName="Risky Model"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/arbitrary code/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /i understand|continue/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('explains the trust_remote_code (runs repo code) risk', () => {
    render(
      <ConsentDialog
        open
        kind="trust_remote_code"
        modelName="Risky Model"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/runs python code/i)).toBeInTheDocument();
  });

  it('invokes onCancel from the cancel control', () => {
    const onCancel = vi.fn();
    render(
      <ConsentDialog
        open
        kind="pickle"
        modelName="Risky Model"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    render(
      <ConsentDialog
        open={false}
        kind="pickle"
        modelName="Risky Model"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
