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
});
