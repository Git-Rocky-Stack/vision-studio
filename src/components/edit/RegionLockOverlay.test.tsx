import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegionLockOverlay } from './RegionLockOverlay';
import type { RegionLock } from '@/types/project';
import { DEFAULT_REGION_MASK } from '@/types/project';

const mockRegion: RegionLock = {
  id: 'region-1',
  sceneId: 'scene-1',
  frameId: 'frame-1',
  name: 'Shirt Region',
  mask: {
    ...DEFAULT_REGION_MASK,
    type: 'rectangle',
    bounds: { x: 100, y: 50, width: 200, height: 150 },
    featherRadius: 4,
    blendEdges: true,
  },
  targetLayers: [],
  protectedLayers: [],
  generationConfig: {},
  aiTool: 'generative-fill',
  prompt: 'Red silk shirt',
  strength: 0.85,
  invertMask: false,
};

const mockInvertedRegion: RegionLock = {
  ...mockRegion,
  id: 'region-2',
  name: 'Background',
  aiTool: 'remove',
  invertMask: true,
};

describe('RegionLockOverlay', () => {
  beforeEach(cleanup);

  it('renders nothing when regionLocks is empty', () => {
    const { container } = render(
      <RegionLockOverlay regionLocks={[]} canvasWidth={1024} canvasHeight={1024} activeRegionId={null} />
    );
    expect(container.querySelector('[data-testid="region-lock-overlay"]')).toBeNull();
  });

  it('renders region masks for each region lock', () => {
    render(
      <RegionLockOverlay
        regionLocks={[mockRegion]}
        canvasWidth={1024}
        canvasHeight={1024}
        activeRegionId={null}
      />
    );
    expect(screen.getByTestId('region-lock-overlay')).toBeInTheDocument();
    expect(screen.getByLabelText('Region: Shirt Region, tool: Fill')).toBeInTheDocument();
  });

  it('renders region labels with AI tool and strength', () => {
    render(
      <RegionLockOverlay
        regionLocks={[mockRegion]}
        canvasWidth={1024}
        canvasHeight={1024}
        activeRegionId={null}
      />
    );
    expect(screen.getByText('Shirt Region')).toBeInTheDocument();
    expect(screen.getByText('Fill')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Shirt Region Fill 85%' })).toBeInTheDocument();
  });

  it('renders invert indicator when invertMask is true', () => {
    render(
      <RegionLockOverlay
        regionLocks={[mockInvertedRegion]}
        canvasWidth={1024}
        canvasHeight={1024}
        activeRegionId={null}
      />
    );
    expect(screen.getByText('INV')).toBeInTheDocument();
  });

  it('renders multiple region locks', () => {
    render(
      <RegionLockOverlay
        regionLocks={[mockRegion, mockInvertedRegion]}
        canvasWidth={1024}
        canvasHeight={1024}
        activeRegionId={null}
      />
    );
    expect(screen.getByText('Shirt Region')).toBeInTheDocument();
    expect(screen.getByText('Background')).toBeInTheDocument();
  });

  it('calls onRegionClick when a region is clicked', async () => {
    const onRegionClick = vi.fn();
    const user = userEvent.setup();
    render(
      <RegionLockOverlay
        regionLocks={[mockRegion]}
        canvasWidth={1024}
        canvasHeight={1024}
        activeRegionId={null}
        onRegionClick={onRegionClick}
      />
    );
    await user.click(screen.getByLabelText('Region: Shirt Region, tool: Fill'));
    expect(onRegionClick).toHaveBeenCalledWith('region-1');
  });

  it('shows corner handles for active region', () => {
    render(
      <RegionLockOverlay
        regionLocks={[mockRegion]}
        canvasWidth={1024}
        canvasHeight={1024}
        activeRegionId="region-1"
      />
    );
    // Active region renders (check z-index class for active state)
    const region = screen.getByLabelText('Region: Shirt Region, tool: Fill');
    expect(region).toHaveClass('z-10');
  });

  it('clips region bounds to canvas dimensions', () => {
    const overflowRegion: RegionLock = {
      ...mockRegion,
      mask: {
        ...mockRegion.mask,
        bounds: { x: 900, y: 900, width: 300, height: 300 },
      },
    };
    render(
      <RegionLockOverlay
        regionLocks={[overflowRegion]}
        canvasWidth={1024}
        canvasHeight={1024}
        activeRegionId={null}
      />
    );
    // Region should render without errors even with overflow bounds
    expect(screen.getByTestId('region-lock-overlay')).toBeInTheDocument();
  });

  it('renders erase badge when mask type is erase', () => {
    const eraseRegion: RegionLock = {
      ...mockRegion,
      id: 'region-erase',
      mask: {
        ...mockRegion.mask,
        type: 'erase',
        bounds: { x: 50, y: 50, width: 200, height: 150 },
      },
    };
    render(
      <RegionLockOverlay
        regionLocks={[eraseRegion]}
        canvasWidth={1024}
        canvasHeight={1024}
        activeRegionId={null}
      />
    );
    expect(screen.getByText('ERASE')).toBeInTheDocument();
  });

  it('renders sky-blue label background for erase masks', () => {
    const eraseRegion: RegionLock = {
      ...mockRegion,
      id: 'region-erase',
      mask: {
        ...mockRegion.mask,
        type: 'erase',
        bounds: { x: 50, y: 50, width: 200, height: 150 },
      },
    };
    render(
      <RegionLockOverlay
        regionLocks={[eraseRegion]}
        canvasWidth={1024}
        canvasHeight={1024}
        activeRegionId={null}
      />
    );
    const label = screen.getByText('Shirt Region').parentElement;
    expect(label?.style.backgroundColor).toBe('rgba(56, 189, 248, 0.9)');
  });

  it('renders dashed border for erase masks even when active', () => {
    const eraseRegion: RegionLock = {
      ...mockRegion,
      id: 'region-erase',
      mask: {
        ...mockRegion.mask,
        type: 'erase',
        bounds: { x: 50, y: 50, width: 200, height: 150 },
      },
    };
    render(
      <RegionLockOverlay
        regionLocks={[eraseRegion]}
        canvasWidth={1024}
        canvasHeight={1024}
        activeRegionId="region-erase"
      />
    );
    // Erase masks always use dashed border, even when active
    const region = screen.getByLabelText('Region: Shirt Region, tool: Fill');
    // Find the border div (second child with border classes)
    const borderEl = region.querySelector('.border-dashed');
    expect(borderEl).toBeTruthy();
  });
});
