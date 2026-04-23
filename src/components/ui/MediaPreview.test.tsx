import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MediaPreview, resolveMediaSourceUrl } from './MediaPreview';

describe('MediaPreview', () => {
  afterEach(cleanup);

  it('renders an image preview with the provided alt text', () => {
    render(
      <MediaPreview
        kind="image"
        src="data:image/png;base64,test"
        alt="Reference still"
        testId="image-preview"
      />,
    );

    expect(screen.getByTestId('image-preview').querySelector('img')).not.toBeNull();
    expect(screen.getByAltText('Reference still')).toBeInTheDocument();
  });

  it('renders a video preview with a playable source and badge', () => {
    render(
      <MediaPreview
        kind="video"
        src="C:/vision-studio-output/clips/demo.mp4"
        poster="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' />"
        alt="Demo clip"
        showControls
        testId="video-preview"
      />,
    );

    const video = screen.getByTestId('video-preview').querySelector('video');

    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe('file:///C:/vision-studio-output/clips/demo.mp4');
    expect(screen.getByText('Video')).toBeInTheDocument();
  });

  it('resolves backend outputs through the local API host', () => {
    expect(resolveMediaSourceUrl('/outputs/clip.mp4')).toBe('http://localhost:8000/outputs/clip.mp4');
  });
});
