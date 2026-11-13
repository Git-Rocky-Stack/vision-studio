import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegionLockProperties } from './RegionLockProperties';
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

describe('RegionLockProperties', () => {
  const defaultProps = {
    region: mockRegion,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onGenerate: vi.fn(),
  };

  beforeEach(cleanup);

  it('renders region name input', () => {
    render(<RegionLockProperties {...defaultProps} />);
    expect(screen.getByLabelText('Region name')).toHaveValue('Shirt Region');
  });

  it('renders prompt textarea for generative-fill', () => {
    render(<RegionLockProperties {...defaultProps} />);
    expect(screen.getByLabelText('Region prompt')).toHaveValue('Red silk shirt');
  });

  it('does not render prompt for upscale tool', () => {
    const upscaleRegion = { ...mockRegion, aiTool: 'upscale' as const };
    render(<RegionLockProperties {...defaultProps} region={upscaleRegion} />);
    expect(screen.queryByLabelText('Region prompt')).not.toBeInTheDocument();
  });

  it('does not render prompt for the remove tool (object removal ignores it)', () => {
    render(<RegionLockProperties {...defaultProps} region={{ ...mockRegion, aiTool: 'remove' }} />);
    expect(screen.queryByLabelText('Region prompt')).not.toBeInTheDocument();
  });

  it('disables Upscale up front with an accessible explanation', async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    render(<RegionLockProperties {...defaultProps} onUpdate={onUpdate} />);
    const upscale = screen.getByRole('button', { name: /upscale/i });
    expect(upscale).toBeDisabled();
    expect(upscale).toHaveAccessibleDescription(/no masked backend pass/i);
    await user.click(upscale);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /style transfer/i })).toBeEnabled();
  });

  it('associates every visible field label with its control', () => {
    render(<RegionLockProperties {...defaultProps} />);
    expect(screen.getByRole('group', { name: 'AI Tool' })).toBeInTheDocument();
    expect(screen.getByLabelText('Generation strength')).toHaveAccessibleDescription(/repainted/i);
    expect(screen.getByLabelText('Invert mask')).toHaveAccessibleDescription(/only the region/i);
  });

  it('renders all AI tool buttons', () => {
    render(<RegionLockProperties {...defaultProps} />);
    expect(screen.getByText('Generative Fill')).toBeInTheDocument();
    expect(screen.getByText('Style Transfer')).toBeInTheDocument();
    expect(screen.getByText('Upscale')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('renders strength slider', () => {
    render(<RegionLockProperties {...defaultProps} />);
    expect(screen.getByLabelText('Generation strength')).toHaveValue('85');
  });

  it('renders feather slider', () => {
    render(<RegionLockProperties {...defaultProps} />);
    expect(screen.getByLabelText('Feather')).toHaveValue('4');
  });

  it('renders blend edges toggle', () => {
    render(<RegionLockProperties {...defaultProps} />);
    expect(screen.getByLabelText('Blend Edges')).toBeInTheDocument();
  });

  it('renders invert mask toggle', () => {
    render(<RegionLockProperties {...defaultProps} />);
    expect(screen.getByLabelText('Invert mask')).toBeInTheDocument();
  });

  it('renders generate button', () => {
    render(<RegionLockProperties {...defaultProps} />);
    expect(screen.getByRole('button', { name: /generate region/i })).toBeInTheDocument();
  });

  it('calls onUpdate when name is changed', async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    render(<RegionLockProperties {...defaultProps} onUpdate={onUpdate} />);
    const nameInput = screen.getByLabelText('Region name');
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');
    expect(onUpdate).toHaveBeenCalled();
  });

  it('calls onUpdate when AI tool is changed', async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    render(<RegionLockProperties {...defaultProps} onUpdate={onUpdate} />);
    await user.click(screen.getByText('Remove'));
    expect(onUpdate).toHaveBeenCalledWith({ aiTool: 'remove' });
  });

  it('calls onDelete when delete button is clicked', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<RegionLockProperties {...defaultProps} onDelete={onDelete} />);
    await user.click(screen.getByLabelText('Delete region lock'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('calls onGenerate when generate button is clicked', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(<RegionLockProperties {...defaultProps} onGenerate={onGenerate} />);
    await user.click(screen.getByRole('button', { name: /generate region/i }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('shows loading state on generate button', () => {
    render(<RegionLockProperties {...defaultProps} isGenerating={true} />);
    // Button component replaces children with "Loading..." when isLoading
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('calls onUpdate when blend edges is toggled', async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    render(<RegionLockProperties {...defaultProps} onUpdate={onUpdate} />);
    await user.click(screen.getByLabelText('Blend Edges'));
    expect(onUpdate).toHaveBeenCalledWith({
      mask: { ...mockRegion.mask, blendEdges: false },
    });
  });

  it('calls onUpdate when invert mask is toggled', async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    render(<RegionLockProperties {...defaultProps} onUpdate={onUpdate} />);
    await user.click(screen.getByLabelText('Invert mask'));
    expect(onUpdate).toHaveBeenCalledWith({ invertMask: true });
  });

  it('displays correct strength percentage', () => {
    render(<RegionLockProperties {...defaultProps} />);
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('displays correct feather value', () => {
    render(<RegionLockProperties {...defaultProps} />);
    expect(screen.getByText('4px')).toBeInTheDocument();
  });

  it('describes Blend Edges and Feather by what they actually do', () => {
    render(<RegionLockProperties {...defaultProps} />);
    expect(screen.getByRole('switch', { name: 'Blend Edges' })).toHaveAccessibleDescription(
      /pasted back over the original/,
    );
    expect(screen.getByLabelText('Feather')).toBeEnabled();
    expect(screen.getByLabelText('Feather')).toHaveAccessibleDescription(/soft edge/);
  });

  it('disables Feather with the reason while Blend Edges is off', () => {
    render(
      <RegionLockProperties
        {...defaultProps}
        region={{ ...mockRegion, mask: { ...mockRegion.mask, blendEdges: false } }}
      />,
    );
    expect(screen.getByLabelText('Feather')).toBeDisabled();
    expect(screen.getByLabelText('Feather')).toHaveAccessibleDescription(/turn Blend Edges on/);
  });
});
