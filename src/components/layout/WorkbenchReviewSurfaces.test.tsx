import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    className,
    src,
  }: {
    alt: string;
    className?: string;
    src: string;
  }) => <img alt={alt} className={className} src={src} />,
}));

import { useAppStore } from '@/store/appStore';

import { WorkbenchBoardsDock } from './WorkbenchBoardsDock';
import { WorkbenchGalleryDock } from './WorkbenchGalleryDock';
import { WorkbenchViewer } from './WorkbenchViewer';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState(), true);
}

function makeAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-1',
    name: 'Generated asset',
    prompt: 'Studio portrait',
    thumbnail: '/thumb.png',
    previewUrl: '/preview.png',
    path: '/asset.png',
    createdAt: '2026-04-22T10:00:00.000Z',
    type: 'image',
    params: {
      model: 'flux-dev',
      width: 1024,
      height: 1024,
    },
    ...overrides,
  } as any;
}

describe('Workbench review surfaces', () => {
  beforeEach(resetStore);

  afterEach(cleanup);

  it('routes the gallery empty state to Assets', () => {
    render(<WorkbenchGalleryDock />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Assets' }));

    expect(useAppStore.getState().activeTab).toBe('assets');
  });

  it('persists gallery density changes through the shared review preference', () => {
    useAppStore.setState({ assetLibrary: [makeAsset()] } as any);

    render(<WorkbenchGalleryDock />);

    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));

    expect(useAppStore.getState().layoutPreferences.reviewDensity).toBe('compact');
    expect(screen.getByTestId('gallery-grid')).toHaveClass('grid-cols-3');
  });

  it('routes the viewer empty state to Generate', () => {
    useAppStore.getState().setActiveTab('assets');

    render(<WorkbenchViewer />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Generate' }));

    expect(useAppStore.getState().activeTab).toBe('generate');
  });

  it('surfaces compare status and compact thumbnail density in the viewer', () => {
    useAppStore.setState({
      assetLibrary: [makeAsset()],
      comparisonImages: ['/preview.png'],
    } as any);

    render(<WorkbenchViewer />);

    expect(screen.getByTestId('viewer-compare-status')).toHaveTextContent(
      'Compare queue started',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));

    expect(useAppStore.getState().layoutPreferences.reviewDensity).toBe('compact');
    const thumbnailRail = screen.getByTestId('viewer-thumbnail-rail');
    const thumbnailButton = within(thumbnailRail).getByRole('button', {
      name: /Review Generated asset/i,
    });

    expect(thumbnailButton).toHaveClass('h-16');
    expect(thumbnailButton).toHaveClass('w-16');
  });

  it('routes the boards empty state back to Generate', () => {
    useAppStore.getState().setActiveTab('assets');

    render(<WorkbenchBoardsDock />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Generate' }));

    expect(useAppStore.getState().activeTab).toBe('generate');
  });

  // These docks and the viewer all sit on the Generate tab, where a button
  // that switches to the Generate tab does nothing when pressed.
  describe('on the Generate tab', () => {
    beforeEach(() => {
      useAppStore.getState().setActiveTab('generate');
    });

    it('offers no Open Generate button in the gallery', () => {
      render(<WorkbenchGalleryDock />);

      expect(screen.queryByRole('button', { name: 'Open Generate' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open Assets' })).toBeInTheDocument();
    });

    it('offers no Open Generate button in the boards dock', () => {
      render(<WorkbenchBoardsDock />);

      expect(screen.queryByRole('button', { name: 'Open Generate' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'New Board' })).toBeInTheDocument();
    });

    it('offers no Open Generate button in the viewer', () => {
      render(<WorkbenchViewer />);

      expect(screen.queryByRole('button', { name: 'Open Generate' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open Assets' })).toBeInTheDocument();
    });
  });

  it('draws the boards toolbar with the compact dock button', () => {
    const project = useAppStore.getState().createProject('Board One');
    useAppStore.getState().setActiveProject(project.id);

    render(<WorkbenchBoardsDock />);

    for (const name of ['Open Storyboard', 'Add Scene', 'New Board']) {
      expect(screen.getByRole('button', { name })).toHaveClass('text-xs');
    }
  });

  it('routes the gallery empty state to Generate from another tab', () => {
    useAppStore.getState().setActiveTab('canvas');

    render(<WorkbenchGalleryDock />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Generate' }));

    expect(useAppStore.getState().activeTab).toBe('generate');
  });

  // The viewer and the gallery offer the same pair of actions. The gallery drew
  // them as mono instrument buttons, the viewer as small sans ones.
  it.each(['Open Generate', 'Open Assets'])('draws %s the same in the viewer and the gallery', (name) => {
    useAppStore.getState().setActiveTab('assets');
    const viewer = render(<WorkbenchViewer />);
    const viewerButton = screen.getByRole('button', { name });
    const viewerClasses = viewerButton.className;
    const viewerLabelStyle = viewerButton.style.textTransform;
    viewer.unmount();

    render(<WorkbenchGalleryDock />);
    const galleryButton = screen.getByRole('button', { name });

    expect(viewerLabelStyle).toBe('uppercase');
    expect(viewerClasses).toBe(galleryButton.className);
  });
});
