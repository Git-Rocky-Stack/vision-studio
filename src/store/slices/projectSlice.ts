import type { Project, Scene, CharacterRef, RegionLock, SceneStatus, GenerationConfig, MaskType } from '@/types/project';
import { DEFAULT_GENERATION_CONFIG, DEFAULT_SCENE_TRANSITION, DEFAULT_SCENE_METADATA } from '@/types/project';
import type { AppSet, AppGet, AppState } from '../appStore.types';

export const projectInitialState = {
  currentProject: null as AppState['currentProject'],
  recentProjects: [] as AppState['recentProjects'],
  projects: [] as Project[],
  activeProjectId: null as string | null,
  activeSceneId: null as string | null,
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
        characters: [],
        scenes: [],
        metadata: {},
      };
      set((state) => ({ projects: [...state.projects, project] }));
      return project;
    },
    deleteProject: (id: string) => set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
      activeSceneId: state.activeProjectId === id ? null : state.activeSceneId,
    })),
    setActiveProject: (id: string | null) => set({ activeProjectId: id, activeSceneId: null }),
    updateProject: (id: string, updates: Partial<Pick<Project, 'name' | 'dimensions' | 'fps' | 'metadata'>>) => set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates, modified: new Date().toISOString() } : p
      ),
    })),
    addScene: (projectId: string, config?: Partial<Scene>): Scene => {
      const now = new Date().toISOString();
      const scene: Scene = {
        id: crypto.randomUUID(),
        orderIndex: 0,
        name: config?.name ?? 'Untitled Scene',
        prompt: config?.prompt ?? '',
        negativePrompt: config?.negativePrompt ?? '',
        generationConfig: config?.generationConfig ?? { ...DEFAULT_GENERATION_CONFIG },
        referenceImages: config?.referenceImages ?? [],
        frames: [],
        regionLocks: [],
        transitions: config?.transitions ?? { ...DEFAULT_SCENE_TRANSITION },
        camera: [],
        metadata: { ...DEFAULT_SCENE_METADATA, created: now, modified: now },
        status: config?.status ?? 'draft',
        characterRefs: [],
        thumbnail: config?.thumbnail,
      };
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
      const dup: Scene = {
        ...scene,
        id: crypto.randomUUID(),
        name: `${scene.name} (copy)`,
        orderIndex: project.scenes.length,
        metadata: { ...scene.metadata, created: now, modified: now },
        frames: [],
        regionLocks: [],
        status: 'draft',
      };

      set((s) => ({
        projects: s.projects.map((p) => {
          if (p.id !== projectId) return p;
          return { ...p, scenes: [...p.scenes, dup], modified: now };
        }),
      }));
      return dup;
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
        mask: config.mask ?? { type: 'rectangle', points: [], bounds: { x: 0, y: 0, width: 100, height: 100 }, featherRadius: 2, blendEdges: true },
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