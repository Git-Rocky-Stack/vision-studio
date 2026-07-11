import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/appStore';
import { provisioningInitialState } from '@/store/slices/provisioningSlice';
import packageJson from '../../../package.json';
import { AboutSection } from './AboutSection';
import type { ProvisionStatus } from '@/types/model';

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
});
