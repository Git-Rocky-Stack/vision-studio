import type {
  Project,
  Scene,
  CharacterRef,
  ImportDraft,
  ImportDraftElementCandidate,
  ImportDraftIssue,
  ImportDraftScene,
  RegionLock,
  SceneStatus,
  GenerationConfig,
  MaskType,
  RegionMask,
  CanvasControlLayer,
  CanvasControlLayerType,
} from '@/types/project';
import {
  DEFAULT_GENERATION_CONFIG,
  DEFAULT_SCENE_TRANSITION,
  DEFAULT_SCENE_METADATA,
  DEFAULT_REGION_MASK,
  DEFAULT_CANVAS_CONTROL_LAYER_MASK,
} from '@/types/project';
import type { AppSet, AppGet, AppState } from '../appStore.types';

function cloneRegionMask(mask?: RegionMask): RegionMask {
  const source = mask ?? DEFAULT_REGION_MASK;

  return {
    ...source,
    points: source.points.map((point) => ({ ...point })),
    bounds: { ...source.bounds },
  };
}

function cloneSceneShotBeats(shotBeats?: Scene['shotBeats']): Scene['shotBeats'] {
  return (shotBeats ?? []).map((beat) => ({
    ...beat,
    elementIds: [...beat.elementIds],
    metadata: { ...beat.metadata },
  }));
}

function cloneImportDraftScene(draftScene: ImportDraftScene): ImportDraftScene {
  return {
    ...draftScene,
    elementCandidateIds: [...draftScene.elementCandidateIds],
    shotBeats: cloneSceneShotBeats(draftScene.shotBeats) ?? [],
    metadata: { ...draftScene.metadata },
  };
}

function cloneImportDraftElementCandidate(
  candidate: ImportDraftElementCandidate,
): ImportDraftElementCandidate {
  return {
    ...candidate,
    aliases: [...candidate.aliases],
    tags: [...candidate.tags],
    referenceSetIds: [...candidate.referenceSetIds],
    metadata: { ...candidate.metadata },
  };
}

function cloneImportDraftIssue(issue: ImportDraftIssue): ImportDraftIssue {
  return {
    ...issue,
  };
}

function cloneImportDraft(draft: ImportDraft): ImportDraft {
  return {
    ...draft,
    sceneDrafts: draft.sceneDrafts.map((sceneDraft) => cloneImportDraftScene(sceneDraft)),
    elementDrafts: draft.elementDrafts.map((candidate) => cloneImportDraftElementCandidate(candidate)),
    issues: draft.issues.map((issue) => cloneImportDraftIssue(issue)),
    metadata: { ...draft.metadata },
  };
}

function defaultCanvasControlLayerName(type: CanvasControlLayerType, orderIndex: number) {
  switch (type) {
    case 'reference-image':
      return `Reference Layer ${orderIndex}`;
    case 'inpaint-mask':
      return `Inpaint Mask ${orderIndex}`;
    case 'controlnet':
    default:
      return `Control Layer ${orderIndex}`;
  }
}

function buildCanvasControlLayer(
  sceneId: string,
  orderIndex: number,
  config?: Partial<Omit<CanvasControlLayer, 'id' | 'sceneId'>>,
): CanvasControlLayer {
  const type = config?.type ?? 'controlnet';

  return {
    id: crypto.randomUUID(),
    sceneId,
    name: config?.name ?? defaultCanvasControlLayerName(type, orderIndex),
    type,
    mask: cloneRegionMask(config?.mask ?? DEFAULT_CANVAS_CONTROL_LAYER_MASK),
    visible: config?.visible ?? true,
    opacity: config?.opacity ?? 1,
    previewTint: config?.previewTint ?? '#d1d5db',
    sourceMediaAssetId: config?.sourceMediaAssetId,
    sourcePath: config?.sourcePath,
    referenceSetId: config?.referenceSetId,
    preprocessor: config?.preprocessor,
    weight: config?.weight,
    startStep: config?.startStep,
    endStep: config?.endStep,
    controlMode: config?.controlMode,
    prompt: config?.prompt,
    negativePrompt: config?.negativePrompt,
    metadata: { ...(config?.metadata ?? {}) },
  };
}

function cloneCanvasControlLayersForScene(
  layers: CanvasControlLayer[] | undefined,
  sceneId: string,
) {
  const idMap = new Map<string, string>();
  const clonedLayers = (layers ?? []).map((layer, index) => {
    const clonedLayer = buildCanvasControlLayer(sceneId, index + 1, {
      ...layer,
      mask: cloneRegionMask(layer.mask),
      metadata: { ...layer.metadata },
    });
    idMap.set(layer.id, clonedLayer.id);
    return clonedLayer;
  });

  return {
    layers: clonedLayers,
    idMap,
  };
}

function buildScene(config: Partial<Scene> | undefined, now: string): Scene {
  const sceneId = crypto.randomUUID();
  const { layers: canvasControlLayers, idMap } = cloneCanvasControlLayersForScene(
    config?.canvasControlLayers,
    sceneId,
  );
  const requestedActiveLayerId = config?.activeCanvasControlLayerId ?? null;

  return {
    id: sceneId,
    orderIndex: 0,
    name: config?.name ?? 'Untitled Scene',
    prompt: config?.prompt ?? '',
    negativePrompt: config?.negativePrompt ?? '',
    generationConfig: config?.generationConfig ?? { ...DEFAULT_GENERATION_CONFIG },
    referenceImages: config?.referenceImages ?? [],
    referenceSetIds: config?.referenceSetIds ?? [],
    canvasControlLayers,
    activeCanvasControlLayerId:
      requestedActiveLayerId !== null
        ? (idMap.get(requestedActiveLayerId) ?? canvasControlLayers[0]?.id ?? null)
        : (canvasControlLayers[0]?.id ?? null),
    timelineClipIds: config?.timelineClipIds ?? [],
    frames: [],
    regionLocks: [],
    transitions: config?.transitions ?? { ...DEFAULT_SCENE_TRANSITION },
    camera: [],
    metadata: { ...DEFAULT_SCENE_METADATA, created: now, modified: now },
    status: config?.status ?? 'draft',
    characterRefs: config?.characterRefs ?? [],
    elementIds: config?.elementIds ? [...config.elementIds] : [],
    shotBeats: cloneSceneShotBeats(config?.shotBeats) ?? [],
    thumbnail: config?.thumbnail,
  };
}

function updateSceneInProjects(
  projects: Project[],
  sceneId: string,
  updater: (scene: Scene) => Scene,
): Project[] {
  return projects.map((project) => {
    let sceneUpdated = false;
    const nextScenes = project.scenes.map((scene) => {
      if (scene.id !== sceneId) {
        return scene;
      }

      sceneUpdated = true;
      return updater(scene);
    });

    return sceneUpdated
      ? { ...project, scenes: nextScenes, modified: new Date().toISOString() }
      : project;
  });
}

export const projectInitialState = {
  currentProject: null as AppState['currentProject'],
  recentProjects: [] as AppState['recentProjects'],
  projects: [] as Project[],
  activeProjectId: null as string | null,
  activeSceneId: null as string | null,
  storyboardImportDrafts: [] as ImportDraft[],
  activeStoryboardImportDraftId: null as string | null,
  regionMode: false,
  activeRegionId: null as string | null,
  activeMaskTool: 'select' as MaskType | 'select',
  maskBrushSize: 20,
  maskInverted: false,
  migrationStatus: 'idle' as const,
  migrationProgress: 0,
};

export function createProjectActions(set: AppSet, _get: AppGet) {
  return {
    setCurrentProject: (project: AppState['currentProject']) => set({ currentProject: project }),
    createProject: (name: string, dimensions?: { width: number; height: number }): Project => {
      const now = new Date().toISOString();
      const project: Project = {
        id: crypto.randomUUID(),
        name,
        created: now,
        modified: now,
        dimensions: dimensions ?? { width: 1920, height: 1080 },
        fps: 24,
        timelineSequenceId: null,
        referenceSetIds: [],
        characters: [],
        elements: [],
        scenes: [],
        metadata: {},
      };
      set((state) => ({ projects: [...state.projects, project] }));
      return project;
    },
    deleteProject: (id: string) =>
      set((state) => {
        const nextStoryboardImportDrafts = state.storyboardImportDrafts.filter(
          (draft) => draft.projectId !== id,
        );
        const activeStoryboardImportDraftId = nextStoryboardImportDrafts.some(
          (draft) => draft.id === state.activeStoryboardImportDraftId,
        )
          ? state.activeStoryboardImportDraftId
          : null;

        return {
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
          activeSceneId: state.activeProjectId === id ? null : state.activeSceneId,
          storyboardImportDrafts: nextStoryboardImportDrafts,
          activeStoryboardImportDraftId,
        };
      }),
    setActiveProject: (id: string | null) => set({ activeProjectId: id, activeSceneId: null }),
    updateProject: (id: string, updates: Partial<Pick<Project, 'name' | 'dimensions' | 'fps' | 'metadata' | 'timelineSequenceId' | 'referenceSetIds'>>) => set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates, modified: new Date().toISOString() } : p
      ),
    })),
    upsertStoryboardImportDraft: (draft: ImportDraft): ImportDraft => {
      const nextDraft = cloneImportDraft(draft);

      set((state) => ({
        storyboardImportDrafts: [
          nextDraft,
          ...state.storyboardImportDrafts.filter((item) => item.id !== nextDraft.id),
        ],
        activeStoryboardImportDraftId: nextDraft.id,
      }));

      return nextDraft;
    },
    deleteStoryboardImportDraft: (id: string) =>
      set((state) => {
        const nextStoryboardImportDrafts = state.storyboardImportDrafts.filter(
          (draft) => draft.id !== id,
        );
        const fallbackDraftId = nextStoryboardImportDrafts[0]?.id ?? null;

        return {
          storyboardImportDrafts: nextStoryboardImportDrafts,
          activeStoryboardImportDraftId:
            state.activeStoryboardImportDraftId === id
              ? fallbackDraftId
              : state.activeStoryboardImportDraftId,
        };
      }),
    setActiveStoryboardImportDraft: (id: string | null) =>
      set((state) => ({
        activeStoryboardImportDraftId:
          id !== null && !state.storyboardImportDrafts.some((draft) => draft.id === id)
            ? state.activeStoryboardImportDraftId
            : id,
      })),
    addScene: (projectId: string, config?: Partial<Scene>): Scene => {
      const now = new Date().toISOString();
      const scene = buildScene(config, now);
      set((state) => ({
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;
          const orderIndex = p.scenes.length;
          return { ...p, scenes: [...p.scenes, { ...scene, orderIndex }], modified: now };
        }),
      }));
      return scene;
    },
    deleteScene: (projectId: string, sceneId: string) => set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          scenes: p.scenes.filter((s) => s.id !== sceneId).map((s, i) => ({ ...s, orderIndex: i })),
          modified: new Date().toISOString(),
        };
      }),
      activeSceneId: state.activeSceneId === sceneId ? null : state.activeSceneId,
    })),
    reorderScenes: (projectId: string, sceneIds: string[]) => set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== projectId) return p;
        const map = new Map(p.scenes.map((s) => [s.id, s]));
        return {
          ...p,
          scenes: sceneIds.map((id, i) => { const s = map.get(id); return s ? { ...s, orderIndex: i } : null; }).filter((s): s is Scene => s !== null),
          modified: new Date().toISOString(),
        };
      }),
    })),
    duplicateScene: (projectId: string, sceneId: string): Scene | undefined => {
      const state = _get();
      const project = state.projects.find((p) => p.id === projectId);
      const scene = project?.scenes.find((s) => s.id === sceneId);
      if (!scene) return undefined;

      const now = new Date().toISOString();
      const dup = buildScene(
        {
          ...scene,
          name: `${scene.name} (copy)`,
          timelineClipIds: [],
          status: 'draft',
          thumbnail: scene.thumbnail,
        },
        now,
      );
      const storedDup = { ...dup, orderIndex: project.scenes.length };

      set((s) => ({
        projects: s.projects.map((p) => {
          if (p.id !== projectId) return p;
          return { ...p, scenes: [...p.scenes, storedDup], modified: now };
        }),
      }));
      return storedDup;
    },
    setActiveScene: (id: string | null) => set({ activeSceneId: id }),
    updateScene: (projectId: string, sceneId: string, updates: Partial<Scene>) => set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          scenes: p.scenes.map((s) =>
            s.id === sceneId ? { ...s, ...updates, metadata: { ...s.metadata, modified: new Date().toISOString() } } : s
          ),
          modified: new Date().toISOString(),
        };
      }),
    })),
    setSceneStatus: (projectId: string, sceneId: string, status: SceneStatus) => set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, scenes: p.scenes.map((s) => s.id === sceneId ? { ...s, status } : s) };
      }),
    })),
    addCharacter: (projectId: string, char: Omit<CharacterRef, 'id' | 'projectId'>): CharacterRef => {
      const character: CharacterRef = { ...char, id: crypto.randomUUID(), projectId };
      set((state) => ({
        projects: state.projects.map((p) => {
          if (p.id !== projectId) return p;
          return { ...p, characters: [...p.characters, character], modified: new Date().toISOString() };
        }),
      }));
      return character;
    },
    updateCharacter: (projectId: string, charId: string, updates: Partial<CharacterRef>) => set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, characters: p.characters.map((c) => c.id === charId ? { ...c, ...updates } : c) };
      }),
    })),
    deleteCharacter: (projectId: string, charId: string) => set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          characters: p.characters.filter((c) => c.id !== charId),
          scenes: p.scenes.map((s) => ({ ...s, characterRefs: s.characterRefs.filter((id) => id !== charId) })),
          modified: new Date().toISOString(),
        };
      }),
    })),
    assignCharacterToScene: (projectId: string, sceneId: string, charId: string) => set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          scenes: p.scenes.map((s) => {
            if (s.id !== sceneId) return s;
            if (s.characterRefs.includes(charId)) return s;
            return { ...s, characterRefs: [...s.characterRefs, charId] };
          }),
        };
      }),
    })),
    removeCharacterFromScene: (projectId: string, sceneId: string, charId: string) => set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, scenes: p.scenes.map((s) => s.id !== sceneId ? s : { ...s, characterRefs: s.characterRefs.filter((id) => id !== charId) }) };
      }),
    })),
    createRegionLock: (sceneId: string, frameId: string, config: Partial<RegionLock>): RegionLock => {
      const lock: RegionLock = {
        id: crypto.randomUUID(),
        sceneId,
        frameId,
        name: config.name ?? 'Region',
        mask: cloneRegionMask(config.mask),
        targetLayers: config.targetLayers ?? [],
        protectedLayers: config.protectedLayers ?? [],
        generationConfig: config.generationConfig ?? {},
        aiTool: config.aiTool ?? 'generative-fill',
        prompt: config.prompt ?? '',
        strength: config.strength ?? 0.85,
        invertMask: config.invertMask ?? false,
      };
      set((state) => ({
        projects: state.projects.map((p) => ({
          ...p,
          scenes: p.scenes.map((s) => s.id !== sceneId ? s : { ...s, regionLocks: [...s.regionLocks, lock] }),
        })),
      }));
      return lock;
    },
    updateRegionLock: (sceneId: string, lockId: string, updates: Partial<RegionLock>) => set((state) => ({
      projects: state.projects.map((p) => ({
        ...p,
        scenes: p.scenes.map((s) => {
          if (s.id !== sceneId) return s;
          return { ...s, regionLocks: s.regionLocks.map((l) => l.id === lockId ? { ...l, ...updates } : l) };
        }),
      })),
    })),
    deleteRegionLock: (sceneId: string, lockId: string) => set((state) => ({
      projects: state.projects.map((p) => ({
        ...p,
        scenes: p.scenes.map((s) => {
          if (s.id !== sceneId) return s;
          return { ...s, regionLocks: s.regionLocks.filter((l) => l.id !== lockId) };
        }),
      })),
    })),
    createCanvasControlLayer: (sceneId: string, config?: Partial<Omit<CanvasControlLayer, 'id' | 'sceneId'>>) => {
      const state = _get();
      const scene = state.projects.flatMap((project) => project.scenes).find((item) => item.id === sceneId);
      if (!scene) {
        return null;
      }

      const layer = buildCanvasControlLayer(sceneId, scene.canvasControlLayers.length + 1, config);
      set((currentState) => ({
        projects: updateSceneInProjects(currentState.projects, sceneId, (currentScene) => ({
          ...currentScene,
          canvasControlLayers: [...currentScene.canvasControlLayers, layer],
          activeCanvasControlLayerId: layer.id,
          metadata: { ...currentScene.metadata, modified: new Date().toISOString() },
        })),
      }));

      return layer;
    },
    updateCanvasControlLayer: (
      sceneId: string,
      layerId: string,
      updates: Partial<Omit<CanvasControlLayer, 'id' | 'sceneId'>>,
    ) => set((state) => ({
      projects: updateSceneInProjects(state.projects, sceneId, (scene) => ({
        ...scene,
        canvasControlLayers: scene.canvasControlLayers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                ...updates,
                mask: updates.mask ? cloneRegionMask(updates.mask) : layer.mask,
                metadata: updates.metadata ? { ...updates.metadata } : layer.metadata,
              }
            : layer,
        ),
        metadata: { ...scene.metadata, modified: new Date().toISOString() },
      })),
    })),
    deleteCanvasControlLayer: (sceneId: string, layerId: string) =>
      set((state) => ({
        projects: updateSceneInProjects(state.projects, sceneId, (scene) => {
          const layerIndex = scene.canvasControlLayers.findIndex((layer) => layer.id === layerId);
          if (layerIndex === -1) {
            return scene;
          }

          const nextLayers = scene.canvasControlLayers.filter((layer) => layer.id !== layerId);
          const fallbackLayer =
            nextLayers[layerIndex] ?? nextLayers[layerIndex - 1] ?? null;

          return {
            ...scene,
            canvasControlLayers: nextLayers,
            activeCanvasControlLayerId:
              scene.activeCanvasControlLayerId === layerId
                ? fallbackLayer?.id ?? null
                : scene.activeCanvasControlLayerId,
            metadata: { ...scene.metadata, modified: new Date().toISOString() },
          };
        }),
      })),
    duplicateCanvasControlLayer: (sceneId: string, layerId: string) => {
      const state = _get();
      const scene = state.projects.flatMap((project) => project.scenes).find((item) => item.id === sceneId);
      const sourceLayer = scene?.canvasControlLayers.find((layer) => layer.id === layerId);
      if (!scene || !sourceLayer) {
        return null;
      }

      const duplicate = buildCanvasControlLayer(sceneId, scene.canvasControlLayers.length + 1, {
        ...sourceLayer,
        name: `${sourceLayer.name} Copy`,
        mask: cloneRegionMask(sourceLayer.mask),
        metadata: { ...sourceLayer.metadata },
      });

      set((currentState) => ({
        projects: updateSceneInProjects(currentState.projects, sceneId, (currentScene) => ({
          ...currentScene,
          canvasControlLayers: [...currentScene.canvasControlLayers, duplicate],
          activeCanvasControlLayerId: duplicate.id,
          metadata: { ...currentScene.metadata, modified: new Date().toISOString() },
        })),
      }));

      return duplicate;
    },
    reorderCanvasControlLayers: (sceneId: string, layerIds: string[]) =>
      set((state) => ({
        projects: updateSceneInProjects(state.projects, sceneId, (scene) => {
          const layerMap = new Map(scene.canvasControlLayers.map((layer) => [layer.id, layer]));
          const orderedLayers = layerIds
            .map((layerId) => layerMap.get(layerId))
            .filter((layer): layer is CanvasControlLayer => Boolean(layer));
          const remainingLayers = scene.canvasControlLayers.filter((layer) => !layerIds.includes(layer.id));

          return {
            ...scene,
            canvasControlLayers: [...orderedLayers, ...remainingLayers],
            activeCanvasControlLayerId:
              scene.activeCanvasControlLayerId &&
              [...orderedLayers, ...remainingLayers].some((layer) => layer.id === scene.activeCanvasControlLayerId)
                ? scene.activeCanvasControlLayerId
                : ([...orderedLayers, ...remainingLayers][0]?.id ?? null),
            metadata: { ...scene.metadata, modified: new Date().toISOString() },
          };
        }),
      })),
    setActiveCanvasControlLayerId: (sceneId: string, layerId: string | null) =>
      set((state) => ({
        projects: updateSceneInProjects(state.projects, sceneId, (scene) => {
          if (
            layerId !== null &&
            !scene.canvasControlLayers.some((layer) => layer.id === layerId)
          ) {
            return scene;
          }

          return {
            ...scene,
            activeCanvasControlLayerId: layerId,
            metadata: { ...scene.metadata, modified: new Date().toISOString() },
          };
        }),
      })),
    setRegionMode: (mode: boolean) => set((state) => ({
      regionMode: mode,
      activeRegionId: mode ? state.activeRegionId : null,
    })),
    setActiveRegionId: (id: string | null) => set({ activeRegionId: id }),
    setActiveMaskTool: (tool: MaskType | 'select') => set({ activeMaskTool: tool }),
    setMaskBrushSize: (size: number) => set({ maskBrushSize: Math.max(1, Math.min(100, Math.round(size))) }),
    toggleMaskInverted: () => set((s) => ({ maskInverted: !s.maskInverted })),
    quickGenerate: (config: GenerationConfig) => {
      const state = _get();
      let quickProject = state.projects.find((p) => p.name === 'Quick Captures');
      if (!quickProject) {
        quickProject = state.createProject('Quick Captures', { width: 1024, height: 1024 });
      }
      const scene = state.addScene(quickProject.id, { prompt: '', generationConfig: config });
      set({ activeProjectId: quickProject.id, activeSceneId: scene.id });
    },
    promoteToProject: (sceneId: string, projectId: string) => {
      const state = _get();
      const sourceProject = state.projects.find((p) => p.scenes.some((s) => s.id === sceneId));
      const scene = sourceProject?.scenes.find((s) => s.id === sceneId);
      if (!scene || !sourceProject) return;

      state.addScene(projectId, {
        ...scene,
        name: scene.name,
        prompt: scene.prompt,
        negativePrompt: scene.negativePrompt,
        generationConfig: scene.generationConfig,
        timelineClipIds: [],
        thumbnail: scene.thumbnail,
      });
      state.deleteScene(sourceProject.id, sceneId);
    },
    runMigration: async () => {
      set({ migrationStatus: 'running', migrationProgress: 0 });
      try {
        const state = _get();
        const libraryProject = state.createProject('My Library', { width: 1024, height: 1024 });
        const totalAssets = state.assetLibrary.length;
        for (let i = 0; i < totalAssets; i++) {
          const asset = state.assetLibrary[i];
          state.addScene(libraryProject.id, {
            name: asset.name,
            prompt: asset.prompt,
            negativePrompt: asset.negativePrompt,
            generationConfig: {
              ...DEFAULT_GENERATION_CONFIG,
              model: asset.model ?? DEFAULT_GENERATION_CONFIG.model,
              width: asset.width ?? DEFAULT_GENERATION_CONFIG.width,
              height: asset.height ?? DEFAULT_GENERATION_CONFIG.height,
              seed: asset.seed ?? -1,
            },
            thumbnail: asset.thumbnail,
            status: 'complete',
          });
          set({ migrationProgress: Math.round(((i + 1) / totalAssets) * 100) });
        }
        const quickProject = state.projects.find((p) => p.name === 'Quick Captures');
        if (!quickProject) {
          state.createProject('Quick Captures', { width: 1024, height: 1024 });
        }
        set({ migrationStatus: 'complete', migrationProgress: 100 });
      } catch (err) {
        console.error('Migration failed:', err);
        set({ migrationStatus: 'error', migrationProgress: 0 });
      }
    },
  };
}
