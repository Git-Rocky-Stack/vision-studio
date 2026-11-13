import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('describes generation as local by default with opt-in hosted routes', () => {
    // "Everything runs on your GPU - no cloud" was false once the OpenRouter
    // and Hugging Face routes shipped; they are opt-in, with the user's key.
    render(<AboutSection />);
    const about = screen.getByTestId('settings-about').textContent ?? '';
    expect(about).toMatch(/on your own GPU by default/);
    expect(about).toMatch(/opt-in, with your own key/);
    expect(about).toMatch(/No subscription/);
    expect(about).not.toMatch(/Everything runs on\s+your GPU/);
    expect(about).not.toMatch(/no cloud/i);
  });

  it('renders the shipped compliance document', () => {
    render(<AboutSection />);
    const licenses = screen.getByTestId('about-licenses');
    expect(licenses).toHaveTextContent('Provisioned AI Models');
    expect(licenses).toHaveTextContent('Stable Diffusion 3.5 Large');
    expect(licenses).toHaveTextContent('PyTorch');
    expect(licenses).toHaveTextContent('Powered by Stability AI');
  });

  it('renders inline code as code, never as raw markdown backticks', () => {
    render(<AboutSection />);
    const licenses = screen.getByTestId('about-licenses');
    expect(licenses.textContent).not.toContain('`');
    expect(within(licenses).getByText('sd3.5-large').tagName).toBe('CODE');
  });

  // The same document ships as a file beside LICENSE and renders on this
  // screen, so its pointer to LICENSE has to read true in both places.
  it('points at the LICENSE without calling itself a file', () => {
    render(<AboutSection />);
    const licenses = screen.getByTestId('about-licenses');
    expect(licenses).not.toHaveTextContent('this file');
    expect(within(licenses).getByText('LICENSE').tagName).toBe('CODE');
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
      download: ReturnType<typeof vi.fn>;
      install: ReturnType<typeof vi.fn>;
      onStatus: ReturnType<typeof vi.fn>;
    };

    function mountWithUpdater(initial: UpdaterStatus = { state: 'idle' }) {
      statusCallback = null;
      unsubscribe = vi.fn();
      updaterMock = {
        getStatus: vi.fn().mockResolvedValue(initial),
        check: vi.fn().mockResolvedValue(initial),
        download: vi.fn().mockResolvedValue({ state: 'downloading', version: '9.9.9', percent: 0 }),
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
      expect(screen.queryByTestId('about-updates-download')).toBeNull();
    });

    describe('explicit download', () => {
      /** Push a status as the main process would, and let React commit it. */
      function push(status: UpdaterStatus) {
        act(() => {
          statusCallback!(status);
        });
      }

      async function mountAvailable(version = '9.9.9') {
        mountWithUpdater({ state: 'available', version });
        await waitFor(() => expect(screen.getByTestId('about-updates-download')).toBeInTheDocument());
        await waitFor(() => expect(statusCallback).not.toBeNull());
      }

      it('offers Download update when an update is available, and downloads nothing on its own', async () => {
        await mountAvailable('9.9.9');

        expect(screen.getByTestId('about-updates-status')).toHaveTextContent(
          'Update 9.9.9 is available. Nothing downloads until you choose Download update.',
        );
        expect(screen.getByTestId('about-updates-download')).toHaveTextContent('Download update');
        expect(screen.getByTestId('about-updates-download')).toBeEnabled();
        expect(updaterMock.download).not.toHaveBeenCalled();
        expect(screen.queryByTestId('about-updates-install')).toBeNull();
      });

      it('does not offer a download in any other state', async () => {
        mountWithUpdater();
        await waitFor(() => expect(statusCallback).not.toBeNull());

        for (const status of [
          { state: 'idle' },
          { state: 'checking' },
          { state: 'not-available' },
          { state: 'disabled' },
          { state: 'error', message: 'feed unreachable' },
          { state: 'downloading', percent: 5 },
          { state: 'downloaded', version: '9.9.9' },
        ] as UpdaterStatus[]) {
          push(status);
          expect(screen.queryByTestId('about-updates-download'), status.state).toBeNull();
        }
      });

      it('walks available -> downloading with real progress -> downloaded -> install', async () => {
        await mountAvailable('9.9.9');

        fireEvent.click(screen.getByTestId('about-updates-download'));
        expect(updaterMock.download).toHaveBeenCalledTimes(1);

        push({ state: 'downloading', version: '9.9.9', percent: 0 });
        push({
          state: 'downloading',
          version: '9.9.9',
          percent: 42.5,
          transferred: 445_644_800,
          total: 1_048_576_000,
          bytesPerSecond: 10_485_760,
        });

        await waitFor(() => expect(screen.queryByTestId('about-updates-download')).toBeNull());
        const bar = screen.getByRole('progressbar', { name: 'Update download progress' });
        expect(bar).toHaveAttribute('aria-valuenow', '43');
        expect(bar).toHaveAttribute('aria-valuetext', '43%, 425.0 MB of 1000.0 MB, 10.0 MB/s');
        expect(screen.getByTestId('about-updates-status')).toHaveTextContent('Downloading update 9.9.9: 43%');
        expect(screen.getByTestId('about-updates-progress')).toHaveTextContent('425.0 MB of 1000.0 MB, 10.0 MB/s');
        expect(screen.getByTestId('about-updates-check')).toBeDisabled();

        push({ state: 'downloaded', version: '9.9.9' });

        expect(screen.queryByRole('progressbar')).toBeNull();
        expect(screen.getByTestId('about-updates-check')).toBeDisabled();
        fireEvent.click(screen.getByTestId('about-updates-install'));
        expect(updaterMock.install).toHaveBeenCalledTimes(1);
      });

      it('shows a loading state while the download request is in flight', async () => {
        await mountAvailable();
        let resolveDownload!: (status: UpdaterStatus) => void;
        updaterMock.download.mockImplementationOnce(
          () => new Promise<UpdaterStatus>((resolve) => (resolveDownload = resolve)),
        );

        fireEvent.click(screen.getByTestId('about-updates-download'));

        const button = screen.getByTestId('about-updates-download');
        expect(button).toBeDisabled();
        expect(button).toHaveTextContent('Starting download...');
        expect(screen.getByTestId('about-updates-check')).toBeDisabled();

        await act(async () => {
          resolveDownload({ state: 'downloading', version: '9.9.9', percent: 0 });
        });

        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
      });

      it('keeps a newer pushed progress when the download reply arrives late', async () => {
        await mountAvailable();
        let resolveDownload!: (status: UpdaterStatus) => void;
        updaterMock.download.mockImplementationOnce(
          () => new Promise<UpdaterStatus>((resolve) => (resolveDownload = resolve)),
        );

        fireEvent.click(screen.getByTestId('about-updates-download'));
        push({ state: 'downloading', version: '9.9.9', percent: 30 });
        await act(async () => {
          resolveDownload({ state: 'downloading', version: '9.9.9', percent: 0 });
        });

        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
      });

      it('announces a refused download request and lets the user try again', async () => {
        await mountAvailable();
        updaterMock.download.mockRejectedValueOnce(new Error('This window is not allowed to call the app.'));

        fireEvent.click(screen.getByTestId('about-updates-download'));

        expect(await screen.findByRole('alert')).toHaveTextContent('This window is not allowed to call the app.');
        expect(screen.getByTestId('about-updates-download')).toBeEnabled();

        fireEvent.click(screen.getByTestId('about-updates-download'));
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
        expect(updaterMock.download).toHaveBeenCalledTimes(2);
      });

      it('falls back to a plain message for a non-Error rejection', async () => {
        await mountAvailable();
        updaterMock.download.mockRejectedValueOnce('nope');

        fireEvent.click(screen.getByTestId('about-updates-download'));

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not start the update download.');
      });

      it('offers Retry download after a failed download, distinct from a failed check', async () => {
        await mountAvailable();

        push({ state: 'error', version: '9.9.9', message: 'net::ERR_CONNECTION_RESET' });

        expect(screen.getByTestId('about-updates-status')).toHaveTextContent(
          'Update 9.9.9 download failed: net::ERR_CONNECTION_RESET',
        );
        const retry = screen.getByTestId('about-updates-download');
        expect(retry).toHaveTextContent('Retry download');
        fireEvent.click(retry);
        expect(updaterMock.download).toHaveBeenCalledTimes(1);

        push({ state: 'error', message: 'feed unreachable' });
        expect(screen.getByTestId('about-updates-status')).toHaveTextContent('Update check failed: feed unreachable');
        expect(screen.queryByTestId('about-updates-download')).toBeNull();
      });

      it('is keyboard operable: Tab reaches Download update and Enter starts it', async () => {
        const user = userEvent.setup();
        await mountAvailable();

        // The updates block precedes the licence links: check first, then download.
        await user.tab();
        expect(screen.getByTestId('about-updates-check')).toHaveFocus();
        await user.tab();
        expect(screen.getByTestId('about-updates-download')).toHaveFocus();

        await user.keyboard('{Enter}');
        expect(updaterMock.download).toHaveBeenCalledTimes(1);
      });

      it('shows a loading state while the restart is being confirmed', async () => {
        mountWithUpdater({ state: 'downloaded', version: '9.9.9' });
        const install = await screen.findByTestId('about-updates-install');
        let finishInstall!: () => void;
        updaterMock.install.mockImplementationOnce(() => new Promise<void>((resolve) => (finishInstall = resolve)));

        fireEvent.click(install);

        expect(screen.getByTestId('about-updates-install')).toBeDisabled();
        expect(screen.getByTestId('about-updates-install')).toHaveTextContent('Preparing restart...');

        // Declined in the main-process dialog: the action becomes available again.
        await act(async () => {
          finishInstall();
        });
        expect(screen.getByTestId('about-updates-install')).toBeEnabled();
        expect(screen.getByTestId('about-updates-install')).toHaveTextContent('Restart to update');
      });
    });
  });
});
