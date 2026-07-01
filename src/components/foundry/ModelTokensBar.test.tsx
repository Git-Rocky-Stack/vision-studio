import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelTokensBar } from './ModelTokensBar';

describe('ModelTokensBar', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { electron?: unknown }).electron;
  });

  it('saves the Hugging Face token and confirms', async () => {
    const setHfToken = vi.fn().mockResolvedValue({ success: true });
    window.electron = {
      auth: { setHfToken, setCivitaiToken: vi.fn() },
    } as unknown as typeof window.electron;
    render(<ModelTokensBar />);

    fireEvent.change(screen.getByLabelText(/hugging face token/i), {
      target: { value: 'hf_x' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save hugging face/i }));

    expect(setHfToken).toHaveBeenCalledWith('hf_x');
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });

  it('saves the CivitAI token', () => {
    const setCivitaiToken = vi.fn().mockResolvedValue({ success: true });
    window.electron = {
      auth: { setHfToken: vi.fn(), setCivitaiToken },
    } as unknown as typeof window.electron;
    render(<ModelTokensBar />);

    fireEvent.change(screen.getByLabelText(/civitai token/i), { target: { value: 'cv_x' } });
    fireEvent.click(screen.getByRole('button', { name: /save civitai/i }));

    expect(setCivitaiToken).toHaveBeenCalledWith('cv_x');
  });

  it('does not save an empty token', () => {
    const setHfToken = vi.fn();
    window.electron = {
      auth: { setHfToken, setCivitaiToken: vi.fn() },
    } as unknown as typeof window.electron;
    render(<ModelTokensBar />);

    fireEvent.click(screen.getByRole('button', { name: /save hugging face/i }));
    expect(setHfToken).not.toHaveBeenCalled();
  });
});
