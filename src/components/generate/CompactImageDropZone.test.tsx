import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompactImageDropZone } from './CompactImageDropZone';

describe('CompactImageDropZone', () => {
  afterEach(cleanup);
  it('renders the label', () => {
    render(<CompactImageDropZone label="Start Frame" image={null} onImageChange={() => {}} />);
    expect(screen.getByText('Start Frame')).toBeInTheDocument();
  });

  it('shows upload prompt when no image', () => {
    render(<CompactImageDropZone label="Start Frame" image={null} onImageChange={() => {}} />);
    expect(screen.getByText('Drop image or click')).toBeInTheDocument();
  });

  it('shows preview when image is provided', () => {
    render(<CompactImageDropZone label="Start Frame" image="data:image/png;base64,test" onImageChange={() => {}} />);
    expect(screen.getByAltText('Start Frame')).toBeInTheDocument();
  });

  it('shows remove button when image is present', () => {
    render(<CompactImageDropZone label="Start Frame" image="data:image/png;base64,test" onImageChange={() => {}} />);
    expect(screen.getByLabelText('Remove Start Frame')).toBeInTheDocument();
  });

  it('calls onImageChange with null when remove is clicked', async () => {
    const onChange = vi.fn();
    render(<CompactImageDropZone label="Start Frame" image="data:image/png;base64,test" onImageChange={onChange} />);
    await userEvent.setup().click(screen.getByLabelText('Remove Start Frame'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
