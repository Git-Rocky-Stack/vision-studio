import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAppStore } from '@/store/appStore';
import { provisioningInitialState } from '@/store/slices/provisioningSlice';
import packageJson from '../../../package.json';
import { AboutSection } from './AboutSection';
import type { ProvisionStatus } from '@/types/model';
import type { UpdaterStatus } from '@/types/electron';

function saiReadySnapshot(): ProvisionStatus {
  return {
    schema_version: 1, overall_progress: 1, total_bytes: 1, present_bytes: 1,
    remaining_bytes: 0, speed: 0, eta: null, total_count: 1, ready_count: 1,
    active_count: 0, error_count: 0, complete: true,
    attribution: 'Powered by Stability AI',
    models: [{
      id: 'sd3.5-large', name: 'SD 3.5 Large', license: 'stabilityai-community',
      attribution: 'Powered by Stability AI', approx_bytes: 1, format: 'safetensors',
      gated: true, status: 'ready', progress: 1, error: null, gate_url: null,
    }],
  };
}

afterEach(cleanup);

describe('AboutSection', () => {
  beforeEach(() => {
    window.electron = { app: { openExternal: vi.fn() } } as unknown as Window['electron'];
    useAppStore.setState({ ...provisioningInitialState });
  });

  it('shows the app identity and version', () => {
    render(<AboutSection />);
    expect(screen.getByTestId('settings-about')).toHaveTextContent(
      `v${packageJson.version}`,
    );
    expect(screen.getAllByText(/MIT License/).length).toBeGreaterThan(0);
  });

  it('renders the shipped compliance document', () => {
    render(<AboutSection />);
    const licenses = screen.getByTestId('about-licenses');
    expect(licenses).toHaveTextContent('Bundled AI Models');
    expect(licenses).toHaveTextContent('Stable Diffusion 3.5 Large');
    expect(licenses).toHaveTextContent('PyTorch');
    expect(licenses).toHaveTextContent('Powered by Stability AI');
  });

  it('license links open externally', () => {
    const openExternal = vi.fn();
    window.electron = { app: { openExternal } } as unknown as Window['electron'];
    render(<AboutSection />);
    fireEvent.click(
      screen.getAllByRole('link', { name: 'Stability AI Community License' })[0],
    );
    expect(openExternal).toHaveBeenCalledWith('https://stability.ai/community-license-agreement');
  });

  it('surfaces the attribution mark when a Stability model is installed', () => {
    useAppStore.setState({ provisionStatus: saiReadySnapshot() });
    render(<AboutSection />);
    expect(screen.getByTestId('about-attribution')).toHaveTextContent('Powered by Stability AI');
  });

  it('hides the live mark when a valid snapshot proves no Stability model is ready', () => {
    const snap = saiReadySnapshot();
    snap.models[0].status = 'missing';
    useAppStore.setState({ provisionStatus: snap });
    render(<AboutSection />);
    expect(screen.queryByTestId('about-attribution')).toBeNull();
  });

  describe('updates block', () => {
    let statusCallback: ((status: UpdaterStatus) => void) | null;
    let unsubscribe: ReturnType<typeof vi.fn>;
    let updaterMock: {
      getStatus: ReturnType<typeof vi.fn>;
      check: ReturnType<typeof vi.fn>;
      install: ReturnType<typeof vi.fn>;
      onStatus: ReturnType<typeof vi.fn>;
    };

    function mountWithUpdater(initial: UpdaterStatus = { state: 'idle' }) {
      statusCallback = null;
      unsubscribe = vi.fn();
      updaterMock = {
        getStatus: vi.fn().mockResolvedValue(initial),
        check: vi.fn().mockResolvedValue(initial),
        install: vi.fn().mockResolvedValue(undefined),
        onStatus: vi.fn((callback: (status: UpdaterStatus) => void) => {
          statusCallback = callback;
          return unsubscribe;
        }),
      };
      window.electron = {
        app: { openExternal: vi.fn() },
        updater: updaterMock,
      } as unknown as Window['electron'];
      return render(<AboutSection />);
    }

    it('reads the live status on mount and offers a manual check', async () => {
      mountWithUpdater({ state: 'not-available', version: packageJson.version });

      expect(screen.getByTestId('about-updates')).toBeInTheDocument();
      expect(updaterMock.getStatus).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.getByText(/latest version/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('about-updates-check'));
      expect(updaterMock.check).toHaveBeenCalledTimes(1);
    });

    it('explains and disables checking when updates are disabled (dev build)', async () => {
      mountWithUpdater({ state: 'disabled' });

      await waitFor(() => {
        expect(screen.getByText(/installed app/i)).toBeInTheDocument();
      });
      expect(screen.getByTestId('about-updates-check')).toBeDisabled();
    });

    it('renders the real download percent pushed by the status stream', async () => {
      mountWithUpdater();
      await waitFor(() => expect(statusCallback).not.toBeNull());

      act(() => {
        statusCallback!({
          state: 'downloading',
          percent: 42.5,
          bytesPerSecond: 1048576,
          transferred: 10,
          total: 100,
        });
      });

      expect(screen.getByTestId('about-updates')).toHaveTextContent('43%'); // Math.round(42.5)
      expect(screen.getByTestId('about-updates-check')).toBeDisabled();
    });

    it('offers Restart to update only once downloaded, wired to install()', async () => {
      mountWithUpdater();
      expect(screen.queryByTestId('about-updates-install')).toBeNull();
      await waitFor(() => expect(statusCallback).not.toBeNull());

      act(() => {
        statusCallback!({ state: 'downloaded', version: '9.9.9' });
      });

      const install = screen.getByTestId('about-updates-install');
      expect(install).toHaveTextContent(/restart to update/i);
      fireEvent.click(install);
      expect(updaterMock.install).toHaveBeenCalledTimes(1);
    });

    it('surfaces updater errors verbatim and keeps the manual check available', async () => {
      mountWithUpdater();
      await waitFor(() => expect(statusCallback).not.toBeNull());

      act(() => {
        statusCallback!({ state: 'error', message: 'sig mismatch' });
      });

      expect(screen.getByTestId('about-updates')).toHaveTextContent('sig mismatch');
      expect(screen.getByTestId('about-updates-check')).toBeEnabled();
    });

    it('unsubscribes from the status stream on unmount', async () => {
      const { unmount } = mountWithUpdater();
      await waitFor(() => expect(statusCallback).not.toBeNull());
      unmount();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('degrades gracefully when the updater bridge is absent', () => {
      window.electron = { app: { openExternal: vi.fn() } } as unknown as Window['electron'];
      render(<AboutSection />);
      expect(screen.getByTestId('about-updates')).toBeInTheDocument();
      expect(screen.getByTestId('about-updates-check')).toBeDisabled();
    });
  });
});
