import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/appStore';
import { provisioningInitialState } from '@/store/slices/provisioningSlice';
import { Header } from './Header';
import type { ProvisionStatus } from '@/types/model';

function snapshot(over: Partial<ProvisionStatus> = {}): ProvisionStatus {
  return {
    schema_version: 1, overall_progress: 0.42, total_bytes: 100, present_bytes: 42,
    remaining_bytes: 58, speed: 0, eta: null, total_count: 33, ready_count: 14,
    active_count: 1, error_count: 0, complete: false, attribution: null,
    models: [{
      id: 'sd-1-5', name: 'SD 1.5', license: null, attribution: null, approx_bytes: 10,
      format: null, gated: false, status: 'downloading', progress: 0.42,
      error: null, gate_url: null,
    }],
    ...over,
  };
}

afterEach(cleanup);

describe('Header provisioning pill', () => {
  beforeEach(() => {
    useAppStore.setState({
      ...provisioningInitialState,
      activeJobs: [],
      generationQueue: [],
      availableModels: [],
    });
  });

  it('reports live provisioning with percent and counts', () => {
    useAppStore.setState({ provisionStatus: snapshot() });
    render(<Header />);
    // The pill is derived arithmetic (0.42 -> 42%, ready/total -> 14/33), so
    // assert the rendered string rather than that a pill merely exists.
    expect(screen.getByText(/Provisioning models/)).toHaveTextContent(
      'Provisioning models: 42% (14/33)'
    );
  });

  it('recomputes the percent and counts from the snapshot it is given', () => {
    useAppStore.setState({
      provisionStatus: snapshot({ overall_progress: 0.07, ready_count: 2, total_count: 9 }),
    });
    render(<Header />);
    expect(screen.getByText(/Provisioning models/)).toHaveTextContent(
      'Provisioning models: 7% (2/9)'
    );
  });

  it('stays silent for a paused set', () => {
    useAppStore.setState({
      provisionStatus: snapshot({
        models: [{
          id: 'sd-1-5', name: 'SD 1.5', license: null, attribution: null, approx_bytes: 10,
          format: null, gated: false, status: 'paused', progress: 0.42,
          error: null, gate_url: null,
        }],
      }),
    });
    render(<Header />);
    expect(screen.queryByText(/Provisioning models/)).toBeNull();
  });
});
