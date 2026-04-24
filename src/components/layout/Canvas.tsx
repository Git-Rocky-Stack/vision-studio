import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3X3,
  Hand,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RegionLockOverlay } from '@/components/edit/RegionLockOverlay';
import { RegionMaskDrawer } from '@/components/edit/RegionMaskDrawer';
import { GenerationProgress } from '@/components/canvas/GenerationProgress';
import { GenerationQueue } from '@/components/canvas/GenerationQueue';
import { CanvasControlLayerRail } from '@/components/canvas/CanvasControlLayerRail';
import { CanvasContextMenu } from '@/components/canvas/CanvasContextMenu';
import { IterationCanvasOverlay } from '@/components/iteration/IterationCanvasOverlay';
import { MediaPreview, isLikelyVideoPath } from '@/components/ui/MediaPreview';
import { extractFrameToEdit } from '@/features/media/frameExtraction';

export const Canvas = memo(function Canvas() {
  const {
    activeJobs,
    currentImage,
    currentImageAssetPath,
    regionMode,
    iterationView,
    activeRegionId,
    activeMaskTool,
    maskBrushSize,
    setActiveRegionId,
    setActiveMaskTool,
    toggleMaskInverted,
    setActiveEditTool,
    setActiveSubMode,
    setActiveTab,
    setCenterView,
    updateRegionLock,
    updateCanvasControlLayer,
    projects,
    activeProjectId,
    activeSceneId,
    activeTimelineClipId,
    mediaAssets,
    timelineClips,
  } = useAppStore(useShallow(s => ({
    activeJobs: s.activeJobs,
    currentImage: s.currentImage,
    currentImageAssetPath: s.currentImageAssetPath,
    regionMode: s.regionMode,
    iterationView: s.iterationView,
    activeRegionId: s.activeRegionId,
    activeMaskTool: s.activeMaskTool,
    maskBrushSize: s.maskBrushSize,
    setActiveRegionId: s.setActiveRegionId,
    setActiveMaskTool: s.setActiveMaskTool,
    toggleMaskInverted: s.toggleMaskInverted,
    setActiveEditTool: s.setActiveEditTool,
    setActiveSubMode: s.setActiveSubMode,
    setActiveTab: s.setActiveTab,
    setCenterView: s.setCenterView,
    updateRegionLock: s.updateRegionLock,
    updateCanvasControlLayer: s.updateCanvasControlLayer,
    projects: s.projects,
    activeProjectId: s.activeProjectId,
    activeSceneId: s.activeSceneId,
    activeTimelineClipId: s.activeTimelineClipId,
    mediaAssets: s.mediaAssets,
    timelineClips: s.timelineClips,
  })));

  const activeScene = useMemo(() => {
    if (!activeProjectId || !activeSceneId) return null;
    const project = projects.find((p) => p.id === activeProjectId);
    return project?.scenes.find((s) => s.id === activeSceneId) ?? null;
  }, [projects, activeProjectId, activeSceneId]);
  // Derive region locks from the active scene
  const regionLocks = useMemo(() => activeScene?.regionLocks ?? [], [activeScene]);
  const activeCanvasControlLayer = useMemo(
    () =>
      activeScene?.canvasControlLayers.find(
        (layer) => layer.id === activeScene.activeCanvasControlLayerId,
      ) ?? null,
    [activeScene],
  );

  const activeRegion = useMemo(
    () => regionLocks.find((r) => r.id === activeRegionId) ?? null,
    [regionLocks, activeRegionId]
  );
  const showExistingControlLayerMask =
    !activeRegion && Boolean(activeCanvasControlLayer?.mask.points.length);

  const handleRegionClick = useCallback((regionId: string) => {
    setActiveRegionId(regionId);
  }, [setActiveRegionId]);

  const handleMaskCommit = useCallback(
    (update: Parameters<Parameters<typeof RegionMaskDrawer>[0]['onMaskCommit']>[0]) => {
      if (!activeSceneId) return;

      if (activeRegion) {
        updateRegionLock(activeSceneId, activeRegion.id, {
          mask: {
            ...activeRegion.mask,
            type: update.type,
            points: update.points,
            bounds: update.bounds,
          },
        });
        return;
      }

      if (activeCanvasControlLayer) {
        updateCanvasControlLayer(activeSceneId, activeCanvasControlLayer.id, {
          mask: {
            ...activeCanvasControlLayer.mask,
            type: update.type,
            points: update.points,
            bounds: update.bounds,
          },
        });
      }
    },
    [activeSceneId, activeRegion, activeCanvasControlLayer, updateRegionLock, updateCanvasControlLayer]
  );
  const [zoom, setZoom] = useState(100);
  const [showGrid, setShowGrid] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 1024, height: 1024 });
  const [imageError, setImageError] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isExtractingFrame, setIsExtractingFrame] = useState(false);
  const [frameStatus, setFrameStatus] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoPreviewRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const panRef = useRef({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCanvasKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      setContextMenu({
        x: rect ? rect.left + rect.width / 2 : 0,
        y: rect ? rect.top + rect.height / 2 : 0,
      });
    }
  }, []);

  const isGenerating = activeJobs.some(
    (j) => j.status === 'pending' || j.status === 'processing'
  );
  const showIterationOverlay = iterationView === 'overlay';
  const isVideoSource = isLikelyVideoPath(currentImageAssetPath ?? currentImage);
  const activeTimelineClip = useMemo(
    () => timelineClips.find((clip) => clip.id === activeTimelineClipId) ?? null,
    [activeTimelineClipId, timelineClips],
  );
  const activeTimelineClipMediaPath = useMemo(() => {
    if (!activeTimelineClip) {
      return null;
    }

    return (
      mediaAssets.find((asset) => asset.id === activeTimelineClip.mediaAssetId)?.path?.replace(/\\/g, '/') ??
      null
    );
  }, [activeTimelineClip, mediaAssets]);
  const hasRenderableImage = Boolean(currentImage && !imageError && !isVideoSource);
  const displayedArtboardSize = hasRenderableImage ? imageSize : { width: 760, height: 460 };

  const handleZoomIn = () => setZoom(Math.min(zoom + 10, 200));
  const handleZoomOut = () => setZoom(Math.max(zoom - 10, 25));
  const handleResetZoom = () => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  };
  const openGenerate = () => {
    setActiveTab('generate');
  };
  const openViewer = () => {
    setCenterView('viewer');
  };
  const openStoryboard = () => {
    setActiveTab('story');
    setActiveSubMode('storyboard');
  };
  const handleExtractFrame = async () => {
    const sourcePath = currentImageAssetPath ?? currentImage;
    if (!sourcePath) {
      setFrameStatus('No managed video source is selected.');
      return;
    }

    const currentPreviewTimeMs = (() => {
      const previewVideo = videoPreviewRef.current?.querySelector('video');
      if (previewVideo && Number.isFinite(previewVideo.currentTime) && previewVideo.currentTime > 0) {
        return Math.round(previewVideo.currentTime * 1000);
      }

      if (
        activeTimelineClip &&
        activeTimelineClipMediaPath &&
        currentImageAssetPath &&
        activeTimelineClipMediaPath === currentImageAssetPath.replace(/\\/g, '/')
      ) {
        return activeTimelineClip.sourceInMs;
      }

      return 0;
    })();

    setIsExtractingFrame(true);
    setFrameStatus(null);

    try {
      const extracted = await extractFrameToEdit({
        sourcePath,
        timeMs: currentPreviewTimeMs,
      });
      setFrameStatus(`Frame extracted at ${(extracted.timeMs / 1000).toFixed(1)}s.`);
    } catch (error) {
      setFrameStatus(error instanceof Error ? error.message : 'Video frame extraction failed.');
    } finally {
      setIsExtractingFrame(false);
    }
  };

  const handleOpenVideoSource = async () => {
    const sourcePath = currentImageAssetPath ?? currentImage;
    if (!sourcePath) {
      setFrameStatus('No local video file is selected.');
      return;
    }

    const result = await window.electron.app.openPath(sourcePath);
    if (!result.success) {
      setFrameStatus(result.error || 'Could not open the selected video file.');
    }
  };

  const handleRevealVideoSource = async () => {
    const sourcePath = currentImageAssetPath ?? currentImage;
    if (!sourcePath) {
      setFrameStatus('No local video file is selected.');
      return;
    }

    const result = await window.electron.assets.reveal(sourcePath);
    if (!result.success) {
      setFrameStatus(result.error || 'Could not reveal the selected video file.');
    }
  };

  // Detect image dimensions when currentImage changes
  useEffect(() => {
    if (!currentImage || isVideoSource) {
      setImageSize({ width: 1024, height: 1024 });
      setImageError(false);
      setIsImageLoading(false);
      return;
    }
    let cancelled = false;
    setIsImageLoading(true);
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
        setImageError(false);
        setIsImageLoading(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setImageError(true);
        setIsImageLoading(false);
      }
    };
    img.src = currentImage;
    return () => { cancelled = true; };
  }, [currentImage, isVideoSource]);

  // Handle scroll wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -5 : 5;
      setZoom((z) => Math.min(200, Math.max(25, z + delta)));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Keep refs in sync with state
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // Handle pan - listeners registered once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startX = 0;
    let startY = 0;
    let initialPanX = 0;
    let initialPanY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        setIsDragging(true);
        startX = e.clientX;
        startY = e.clientY;
        initialPanX = panRef.current.x;
        initialPanY = panRef.current.y;
        e.preventDefault();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      setPan({
        x: initialPanX + dx,
        y: initialPanY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []); // Empty dependency array - register once

  // Keyboard shortcuts for canvas
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Region mask tool shortcuts (only active in region mode)
      if (regionMode) {
        switch (e.key.toLowerCase()) {
          case 'v':
            setActiveMaskTool('select');
            return;
          case 'r':
            setActiveMaskTool('rectangle');
            return;
          case 'l':
            setActiveMaskTool('polygon');
            return;
          case 'b':
            setActiveMaskTool('brush');
            return;
          case 'e':
            setActiveMaskTool('erase');
            return;
          case 'i':
            toggleMaskInverted();
            return;
        }
      } else {
        // Edit tool shortcuts (only active outside region mode)
        switch (e.key.toLowerCase()) {
          case 'v':
            setActiveEditTool('move');
            return;
          case 't':
            setActiveEditTool('scale');
            return;
          case 'c':
            setActiveEditTool('crop');
            return;
          case 'r':
            setActiveEditTool('rotate');
            return;
          case 'b':
            setActiveEditTool('brush');
            return;
          case 'e':
            setActiveEditTool('eraser');
            return;
          case 's':
            setActiveEditTool('clone');
            return;
          case 'j':
            setActiveEditTool('heal');
            return;
          case 'x':
            setActiveEditTool('text');
            return;
          case 'u':
            setActiveEditTool('shape');
            return;
          case 'p':
            setActiveEditTool('pen');
            return;
          case 'h':
            setActiveEditTool('hand');
            return;
          case 'z':
            setActiveEditTool('zoom');
            return;
          case 'i':
            setActiveEditTool('eyedropper');
            return;
        }
      }
      // Canvas zoom shortcuts
      switch (e.key) {
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case '0':
          handleResetZoom();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoom, regionMode]);

  return (
    <div
      className={cn(
        'h-full min-h-0 flex-1 flex flex-col bg-void relative overflow-hidden',
        isGenerating && 'ring-1 ring-accent-primary/20'
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(215,255,63,0.045),transparent_34%),linear-gradient(180deg,var(--color-void),var(--color-canvas))]" />

      {/* Canvas Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-1.5 px-2 py-1.5 glass glass-border rounded-md shadow-cinematic">
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-md text-text-body hover:text-text-primary hover:bg-elevated transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-body disabled:hover:bg-transparent"
            aria-label="Zoom out"
            disabled={zoom <= 25}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-text-primary w-14 text-center">
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-md text-text-body hover:text-text-primary hover:bg-elevated transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-body disabled:hover:bg-transparent"
            aria-label="Zoom in"
            disabled={zoom >= 200}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={handleResetZoom}
            className="p-2 rounded-md text-text-body hover:text-text-primary hover:bg-elevated transition-all"
            aria-label="Reset view"
          >
            <Maximize className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={cn(
              'p-2 rounded-md transition-all',
              showGrid
                ? 'text-accent-primary bg-accent-primary-muted border border-accent-primary-border'
                : 'text-text-body hover:text-text-primary hover:bg-elevated'
            )}
            aria-label="Toggle grid"
            aria-pressed={showGrid}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <CanvasControlLayerRail
        className={cn(
          'absolute top-4 z-10',
          regionMode ? 'left-20' : 'left-4',
        )}
      />

      {/* Canvas Container */}
      <div
        ref={containerRef}
        onContextMenu={handleContextMenu}
        onKeyDown={handleCanvasKeyDown}
        role="application"
        aria-label="Image canvas"
        aria-roledescription="canvas workspace"
        tabIndex={0}
        className={cn(
          'flex-1 relative overflow-hidden',
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
      >
        <div className="sr-only" aria-live="polite">
          {isVideoSource
            ? `Canvas has a video source selected. Open Viewer for playback or extract a frame before editing. Zoom ${zoom} percent.`
            : currentImage
            ? `Canvas image loaded at ${imageSize.width} by ${imageSize.height} pixels. Zoom ${zoom} percent.`
            : `Empty image canvas. Zoom ${zoom} percent.`}
        </div>
        {/* Grid Background */}
        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{
              backgroundImage: `
                linear-gradient(to right, var(--color-border) 1px, transparent 1px),
                linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)
              `,
              backgroundSize: '16px 16px',
            }}
          />
        )}

        {/* Canvas Content */}
        <motion.div
          ref={canvasRef}
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {/* Artboard */}
          <div
            className={cn(
              'relative bg-canvas shadow-cinematic border',
              hasRenderableImage
                ? 'border-border'
                : 'border-border-hover bg-[linear-gradient(135deg,rgba(255,255,255,0.035),rgba(255,255,255,0.01))]'
            )}
            style={{ width: displayedArtboardSize.width, height: displayedArtboardSize.height }}
          >
            {/* Current Image or Placeholder */}
            {isVideoSource ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-text-body">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full max-w-lg rounded-2xl border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-6 py-6 text-center shadow-cinematic"
                >
                  <div
                    ref={videoPreviewRef}
                    className="mx-auto mb-4 aspect-video w-full max-w-sm overflow-hidden rounded-xl border border-border bg-void"
                  >
                    <MediaPreview
                      kind="video"
                      src={currentImageAssetPath ?? currentImage}
                      poster={currentImage}
                      alt="Selected video source"
                      className="h-full w-full"
                      mediaClassName="h-full w-full object-contain"
                      fallbackClassName="h-full w-full"
                      showPlayBadge
                    />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-display text-xl font-semibold text-text-primary">
                      Video selected
                    </h3>
                    <p className="text-sm text-text-body">
                      Canvas editing stays frame-based. Extract the current playback frame to continue editing, reference it, or send it back to the timeline.
                    </p>
                    {frameStatus ? (
                      <p className="text-xs text-text-primary">{frameStatus}</p>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleExtractFrame()}
                      disabled={isExtractingFrame}
                      className="inline-flex items-center rounded-md border border-accent-primary-border bg-accent-primary-muted px-3 py-2 type-ui text-accent-primary transition-all hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isExtractingFrame ? 'Extracting...' : 'Extract frame'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenVideoSource()}
                      className="inline-flex items-center rounded-md border border-border px-3 py-2 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
                    >
                      Open file
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRevealVideoSource()}
                      className="inline-flex items-center rounded-md border border-border px-3 py-2 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
                    >
                      Show in folder
                    </button>
                    <button
                      type="button"
                      onClick={openViewer}
                      className="inline-flex items-center rounded-md border border-accent-primary-border bg-accent-primary-muted px-3 py-2 type-ui text-accent-primary transition-all hover:bg-elevated"
                    >
                      Return to Viewer
                    </button>
                    <button
                      type="button"
                      onClick={openStoryboard}
                      className="inline-flex items-center rounded-md border border-border px-3 py-2 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
                    >
                      Open Storyboard
                    </button>
                  </div>
                </motion.div>
              </div>
            ) : currentImage && !imageError ? (
              <>
                {isImageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-surface/50">
                    <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
                  </div>
                )}
                <img
                  src={currentImage}
                  alt="Canvas"
                  data-testid="generation-result"
                  className="absolute inset-0 w-full h-full object-contain"
                  onLoad={() => setIsImageLoading(false)}
                />
              </>
            ) : imageError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-text-body">
                <div className="text-center space-y-2">
                  <p className="font-display text-sm text-red-primary">Failed to load image</p>
                  <p className="font-mono text-xs text-text-muted">The file may be corrupted or missing</p>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-text-body">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full max-w-md rounded-2xl border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-8 py-10 text-center shadow-cinematic"
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-accent-primary-border bg-accent-primary-muted shadow-accent-subtle">
                    <Sparkles className="h-6 w-6 text-accent-primary" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-text-primary">
                      Start with an image, scene, or prompt
                    </h3>
                    <p className="text-sm text-text-body mt-1">
                      Choose a workflow and build from every result.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={openGenerate}
                      className="inline-flex items-center rounded-md border border-accent-primary-border bg-accent-primary-muted px-3 py-2 type-ui text-accent-primary transition-all hover:bg-elevated"
                    >
                      Generate from prompt
                    </button>
                    <button
                      type="button"
                      onClick={openViewer}
                      className="inline-flex items-center rounded-md border border-border px-3 py-2 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
                    >
                      Open Viewer
                    </button>
                    <button
                      type="button"
                      onClick={openStoryboard}
                      className="inline-flex items-center rounded-md border border-border px-3 py-2 type-ui text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
                    >
                      Open Storyboard
                    </button>
                  </div>
                  <div className="flex items-center gap-2 justify-center text-xs text-text-muted font-mono">
                    <Hand className="w-3.5 h-3.5" />
                    <span>Shift + Drag to pan</span>
                    <span className="h-3 w-px bg-border" aria-hidden="true" />
                    <span>Scroll to zoom</span>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Canvas Border Overlay */}
            <div className="absolute inset-0 pointer-events-none border border-dashed border-border rounded-sm" />

            {showIterationOverlay && (
              <div className="absolute inset-0 z-[1]" data-testid="iteration-canvas-overlay">
                <IterationCanvasOverlay className="h-full w-full bg-transparent" />
              </div>
            )}

            {/* Region Lock Overlay - visible when region mode is active */}
            {regionMode && (
              <RegionLockOverlay
                regionLocks={regionLocks}
                canvasWidth={imageSize.width}
                canvasHeight={imageSize.height}
                activeRegionId={activeRegionId}
                onRegionClick={handleRegionClick}
              />
            )}

            {/* Region Mask Drawer - region locks take precedence, otherwise the active control layer owns the mask surface */}
            {regionMode && (activeRegion || activeCanvasControlLayer) && (
              <RegionMaskDrawer
                activeRegion={activeRegion ?? activeCanvasControlLayer!}
                canvasWidth={imageSize.width}
                canvasHeight={imageSize.height}
                tool={activeMaskTool}
                brushSize={maskBrushSize}
                showExistingMaskWhenSelect={showExistingControlLayerMask}
                onMaskCommit={handleMaskCommit}
              />
            )}
          </div>
        </motion.div>

        {/* Generation Progress Overlay */}
        <AnimatePresence>
          {isGenerating && <GenerationProgress />}
        </AnimatePresence>
      </div>

      {/* Generation Queue Strip */}
      <AnimatePresence>
        <GenerationQueue />
      </AnimatePresence>

      {/* Canvas Info */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="px-3 py-1.5 glass glass-border rounded-md">
          <span className="font-mono text-xs text-text-body">
            {isVideoSource
              ? 'Video source selected, frame editing pending'
              : `${imageSize.width} x ${imageSize.height}px, Artboard 1`}
          </span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
});
