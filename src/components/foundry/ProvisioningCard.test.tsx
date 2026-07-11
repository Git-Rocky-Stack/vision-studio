import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/appStore';
import { provisioningInitialState } from '@/store/slices/provisioningSlice';
import { ProvisioningCard } from './ProvisioningCard';
import type { ProvisionModel, ProvisionStatus } from '@/types/model';

function model(over: Partial<ProvisionModel> = {}): ProvisionModel {
  return {
    id: 'sd-1-5', name: 'SD 1.5', license: null, attribution: null, approx_bytes: 100,
    format: null, gated: false, status: 'ready', progress: 1, error: null,
    gate_url: null, ...over,
  };
}

function snapshot(over: Partial<ProvisionStatus> = {}): ProvisionStatus {
  return {
    schema_version: 1, overall_progress: 1, total_bytes: 100, present_bytes: 100,
    remaining_bytes: 0, speed: 0, eta: null, total_count: 33, ready_count: 33,
    active_count: 0, error_count: 0, complete: true,
    attribution: 'Powered by Stability AI', models: [model()], ...over,
  };
}

afterEach(cleanup);

describe('ProvisioningCard', () => {
  beforeEach(() => {
    useAppStore.setState({ ...provisioningInitialState });
  });

  it('renders nothing without a snapshot', () => {
    render(<ProvisioningCard />);
    expect(screen.queryByTestId('provisioning-card')).toBeNull();
  });

  it('complete set: reports readiness, attribution, and offers verify-and-repair', () => {
    const reverifyProvisioning = vi.fn();
    useAppStore.setState({
      provisionStatus: snapshot({
        models: [
          model(),
          model({
            id: 'sd3.5-large', name: 'SD 3.5 Large',
            attribution: 'Powered by Stability AI',
          }),
        ],
      }),
      reverifyProvisioning,
    });
    render(<ProvisioningCard />);
    expect(screen.getByText(/All 33 models installed/)).toBeInTheDocument();
    expect(screen.getByText('Powered by Stability AI')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('provisioning-card-verify'));
    expect(reverifyProvisioning).toHaveBeenCalledOnce();
  });

  it('incomplete idle set: offers install-remaining and reopening the setup screen', () => {
    const startProvisioning = vi.fn();
    useAppStore.setState({
      provisionStatus: snapshot({
        complete: false, ready_count: 10, remaining_bytes: 50,
        models: [model({ status: 'missing', progress: 0 })],
      }),
      firstRunProvisionDismissed: true,
      startProvisioning,
    });
    render(<ProvisioningCard />);
    fireEvent.click(screen.getByTestId('provisioning-card-install'));
    expect(startProvisioning).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('provisioning-card-open'));
    expect(useAppStore.getState().firstRunProvisionDismissed).toBe(false);
  });

  it('live set: shows progress and pause; paused set: shows resume', () => {
    const pauseProvisioning = vi.fn();
    const resumeProvisioning = vi.fn();
    useAppStore.setState({
      provisionStatus: snapshot({
        complete: false, overall_progress: 0.42, ready_count: 14, active_count: 1,
        models: [model({ status: 'downloading', progress: 0.42 })],
      }),
      pauseProvisioning,
      resumeProvisioning,
    });
    const { rerender } = render(<ProvisioningCard />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    fireEvent.click(screen.getByTestId('provisioning-card-pause'));
    expect(pauseProvisioning).toHaveBeenCalledOnce();

    useAppStore.setState({
      provisionStatus: snapshot({
        complete: false, active_count: 1,
        models: [model({ status: 'paused', progress: 0.42 })],
      }),
    });
    rerender(<ProvisioningCard />);
    fireEvent.click(screen.getByTestId('provisioning-card-resume'));
    expect(resumeProvisioning).toHaveBeenCalledOnce();
  });
});
