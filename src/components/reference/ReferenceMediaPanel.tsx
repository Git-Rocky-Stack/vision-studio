import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  ImagePlus,
  Layers3,
  Plus,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { createMediaAssetFromAssetRecord } from '@/features/assets/assetRecords';
import { useAppStore } from '@/store/appStore';
import type { AssetRecord } from '@/types/assets';
import type {
  ReferenceSet,
  ReferenceSlotType,
} from '@/types/media';
import { cn } from '@/utils/cn';

const REFERENCE_SLOT_OPTIONS: { id: ReferenceSlotType; label: string; description: string }[] = [
  { id: 'style', label: 'Style', description: 'Palette, lighting, and finish.' },
  { id: 'composition', label: 'Composition', description: 'Framing and layout.' },
  { id: 'character', label: 'Character', description: 'Identity and continuity.' },
  { id: 'pose', label: 'Pose', description: 'Body language and staging.' },
  { id: 'motion', label: 'Motion', description: 'Movement and timing anchors.' },
];

interface ReferenceMediaPanelProps {
  title: string;
  description: string;
  scope: ReferenceSet['scope'];
  projectId?: string | null;
  sceneId?: string | null;
  clipId?: string | null;
  preferredSlots?: ReferenceSlotType[];
  emptyState?: string;
  testId?: string;
  className?: string;
}

interface ReferenceCandidate {
  id: string;
  label: string;
  previewUrl: string;
  path: string;
  mediaAssetId: string | null;
  source: 'media' | 'asset';
  assetRecord: AssetRecord | null;
}

interface ResolvedReferenceItem {
  id: string;
  slot: ReferenceSlotType;
  label: string;
  previewUrl: string;
  path: string;
}

function findScopedReferenceSet(
  referenceSets: ReferenceSet[],
  scope: ReferenceSet['scope'],
  projectId?: string | null,
  sceneId?: string | null,
  clipId?: string | null,
) {
  return (
    referenceSets.find(
      (referenceSet) =>
        referenceSet.scope === scope &&
        referenceSet.projectId === (projectId ?? null) &&
        referenceSet.sceneId === (sceneId ?? null) &&
        referenceSet.clipId === (clipId ?? null),
    ) ?? null
  );
}

export function ReferenceMediaPanel({
  title,
  description,
  scope,
  projectId = null,
  sceneId = null,
  clipId = null,
  preferredSlots,
  emptyState = 'No references attached yet. Promote a reference-ready image from Assets or generated output.',
  testId = 'reference-media-panel',
  className,
}: ReferenceMediaPanelProps) {
  const {
    assetLibrary,
    mediaAssets,
    referenceSets,
    createReferenceSet,
    updateReferenceSet,
    deleteReferenceSet,
    upsertMediaAsset,
  } = useAppStore(useShallow((state) => ({
    assetLibrary: state.assetLibrary,
    mediaAssets: state.mediaAssets,
    referenceSets: state.referenceSets,
    createReferenceSet: state.createReferenceSet,
    updateReferenceSet: state.updateReferenceSet,
    deleteReferenceSet: state.deleteReferenceSet,
    upsertMediaAsset: state.upsertMediaAsset,
  })));

  const slotOptions = useMemo(
    () =>
      preferredSlots?.length
        ? REFERENCE_SLOT_OPTIONS.filter((option) => preferredSlots.includes(option.id))
        : REFERENCE_SLOT_OPTIONS,
    [preferredSlots],
  );

  const [selectedSlot, setSelectedSlot] = useState<ReferenceSlotType>(slotOptions[0]?.id ?? 'style');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');

  const referenceSet = useMemo(
    () => findScopedReferenceSet(referenceSets, scope, projectId, sceneId, clipId),
    [clipId, projectId, referenceSets, sceneId, scope],
  );

  const candidates = useMemo<ReferenceCandidate[]>(() => {
    const candidatesById = new Map<string, ReferenceCandidate>();

    for (const mediaAsset of mediaAssets) {
      if (mediaAsset.type !== 'image') {
        continue;
      }

      candidatesById.set(`media:${mediaAsset.id}`, {
        id: `media:${mediaAsset.id}`,
        label: mediaAsset.name,
        previewUrl: mediaAsset.thumbnailUrl || mediaAsset.previewUrl || mediaAsset.path,
        path: mediaAsset.path,
        mediaAssetId: mediaAsset.id,
        source: 'media',
        assetRecord: null,
      });
    }

    for (const asset of assetLibrary) {
      if (asset.type !== 'image' || asset.params.reference_ready === false) {
        continue;
      }

      const matchingMediaAsset =
        mediaAssets.find(
          (mediaAsset) =>
            mediaAsset.type === 'image' &&
            (mediaAsset.legacyAssetId === asset.id || mediaAsset.path === asset.path),
        ) ?? null;

      if (matchingMediaAsset) {
        candidatesById.set(`media:${matchingMediaAsset.id}`, {
          id: `media:${matchingMediaAsset.id}`,
          label: matchingMediaAsset.name,
          previewUrl:
            matchingMediaAsset.thumbnailUrl ||
            matchingMediaAsset.previewUrl ||
            matchingMediaAsset.path,
          path: matchingMediaAsset.path,
          mediaAssetId: matchingMediaAsset.id,
          source: 'media',
          assetRecord: null,
        });
        continue;
      }

      candidatesById.set(`asset:${asset.id}`, {
        id: `asset:${asset.id}`,
        label: asset.name || 'Reference image',
        previewUrl: asset.thumbnail || asset.previewUrl || asset.path,
        path: asset.path,
        mediaAssetId: null,
        source: 'asset',
        assetRecord: asset,
      });
    }

    return [...candidatesById.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [assetLibrary, mediaAssets]);

  const resolvedItems = useMemo(() => {
    if (!referenceSet) {
      return [];
    }

    return referenceSet.items
      .map((item) => {
        const mediaAsset = item.mediaAssetId
          ? mediaAssets.find((asset) => asset.id === item.mediaAssetId) ?? null
          : null;
        const path = item.path ?? mediaAsset?.path ?? null;

        if (!path) {
          return null;
        }

        return {
          id: item.id,
          slot: item.slot,
          label: item.label || mediaAsset?.name || 'Reference image',
          previewUrl:
            mediaAsset?.thumbnailUrl ||
            mediaAsset?.previewUrl ||
            item.path ||
            mediaAsset?.path ||
            '',
          path,
        } satisfies ResolvedReferenceItem;
      })
      .filter((item): item is ResolvedReferenceItem => Boolean(item));
  }, [mediaAssets, referenceSet]);

  const handleAddReference = () => {
    const candidate =
      candidates.find((item) => item.id === selectedCandidateId) ??
      candidates[0] ??
      null;

    if (!candidate) {
      return;
    }

    let mediaAssetId = candidate.mediaAssetId;
    let path = candidate.path;
    let label = candidate.label;

    if (!mediaAssetId && candidate.assetRecord) {
      const nextMediaAsset = createMediaAssetFromAssetRecord(candidate.assetRecord);
      upsertMediaAsset(nextMediaAsset);
      mediaAssetId = nextMediaAsset.id;
      path = nextMediaAsset.path;
      label = nextMediaAsset.name;
    }

    const duplicateExists = referenceSet?.items.some(
      (item) =>
        item.slot === selectedSlot &&
        ((mediaAssetId && item.mediaAssetId === mediaAssetId) || item.path === path),
    );
    if (duplicateExists) {
      return;
    }

    const nextItem = {
      id: crypto.randomUUID(),
      slot: selectedSlot,
      mediaAssetId,
      path,
      label,
      orderIndex: referenceSet?.items.length ?? 0,
    };

    if (!referenceSet) {
      createReferenceSet({
        name: title,
        scope,
        projectId,
        sceneId,
        clipId,
        items: [nextItem],
        tags: [`scope:${scope}`],
      });
      return;
    }

    updateReferenceSet(referenceSet.id, {
      items: [...referenceSet.items, nextItem],
    });
  };

  const handleRemoveReference = (itemId: string) => {
    if (!referenceSet) {
      return;
    }

    const nextItems = referenceSet.items
      .filter((item) => item.id !== itemId)
      .map((item, index) => ({
        ...item,
        orderIndex: index,
      }));

    updateReferenceSet(referenceSet.id, { items: nextItems });
  };

  return (
    <section
      data-testid={testId}
      className={cn('rounded-lg border border-border bg-elevated/60 p-3', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="type-section text-text-primary">{title}</h3>
            <span className="rounded-full border border-border bg-surface px-2 py-0.5 type-caption text-text-body">
              {resolvedItems.length} ref{resolvedItems.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-1 type-caption text-text-body">{description}</p>
        </div>

        {referenceSet ? (
          <button
            type="button"
            onClick={() => deleteReferenceSet(referenceSet.id)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 type-ui text-text-body transition-all hover:border-border-hover hover:bg-surface hover:text-text-primary"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </button>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {resolvedItems.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {resolvedItems.map((item) => (
              <article
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2"
              >
                <ImageWithFallback
                  src={item.previewUrl}
                  alt={item.label}
                  className="h-full w-full object-cover"
                  fallbackClassName="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-void"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border bg-elevated px-2 py-0.5 type-caption uppercase tracking-[0.12em] text-text-muted">
                      {item.slot}
                    </span>
                  </div>
                  <p className="mt-2 truncate type-ui text-text-primary">{item.label}</p>
                  <p className="mt-1 truncate type-caption text-text-muted">{item.path}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveReference(item.id)}
                  aria-label={`Remove ${item.label}`}
                  className="rounded-md border border-border p-2 text-text-body transition-all hover:border-border-hover hover:bg-elevated hover:text-text-primary"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center">
            <Layers3 className="mx-auto h-5 w-5 text-text-muted" aria-hidden="true" />
            <p className="mt-2 text-sm text-text-body">{emptyState}</p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,150px),minmax(0,1fr),auto]">
            <label className="space-y-1.5">
              <span className="type-caption text-text-muted">Slot</span>
              <select
                data-testid={`${testId}-slot-select`}
                value={selectedSlot}
                onChange={(event) => setSelectedSlot(event.target.value as ReferenceSlotType)}
                className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
              >
                {slotOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="type-caption text-text-muted">Reference-ready image</span>
              <select
                data-testid={`${testId}-media-select`}
                value={selectedCandidateId}
                onChange={(event) => setSelectedCandidateId(event.target.value)}
                className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
              >
                <option value="">
                  {candidates.length > 0 ? 'Choose an image' : 'No reference-ready images available'}
                </option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label} {candidate.source === 'asset' ? '(promote)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={Plus}
                disabled={candidates.length === 0}
                data-testid={`${testId}-add-button`}
                onClick={handleAddReference}
                className="w-full md:w-auto"
              >
                Add
              </Button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 type-caption text-text-muted">
            <span className="inline-flex items-center gap-1">
              <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
              {candidates.length} reference-ready image{candidates.length === 1 ? '' : 's'}
            </span>
            <span>
              {slotOptions.find((option) => option.id === selectedSlot)?.description}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
