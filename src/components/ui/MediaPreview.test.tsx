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

  it('draws a poster-only tile as a lazy image, with no video element', () => {
    render(
      <MediaPreview
        kind="video"
        src="/outputs/clip.mp4"
        poster="/outputs/clip.jpg"
        alt="Clip"
        posterOnly
        testId="tile"
      />,
    );

    const tile = screen.getByTestId('tile');
    expect(tile.querySelector('video')).toBeNull();
    const poster = screen.getByAltText('Clip');
    expect(poster).toHaveAttribute('src', 'http://localhost:8000/outputs/clip.jpg');
    expect(poster).toHaveAttribute('loading', 'lazy');
  });

  it('draws a placeholder for a poster-only tile that has no poster', () => {
    render(<MediaPreview kind="video" src="/outputs/clip.mp4" alt="Clip" posterOnly testId="tile" />);

    expect(screen.getByTestId('tile').querySelector('video')).toBeNull();
    expect(screen.getByRole('img', { name: 'Clip' })).toBeInTheDocument();
  });

  it('resolves backend outputs through the local API host', () => {
    expect(resolveMediaSourceUrl('/outputs/clip.mp4')).toBe('http://localhost:8000/outputs/clip.mp4');
  });
});
