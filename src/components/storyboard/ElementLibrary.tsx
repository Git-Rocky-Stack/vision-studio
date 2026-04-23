import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Box,
  MapPin,
  Palette,
  Shapes,
  Sparkles,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';
import type { Element, ElementType, Scene } from '@/types/project';
import { cn } from '@/utils/cn';

interface ElementLibraryProps {
  projectId: string;
}

function typeIcon(type: ElementType) {
  switch (type) {
    case 'character':
      return User;
    case 'location':
      return MapPin;
    case 'style':
      return Palette;
    case 'object':
    default:
      return Box;
  }
}

function typeLabel(type: ElementType) {
  switch (type) {
    case 'character':
      return 'Character';
    case 'location':
      return 'Location';
    case 'style':
      return 'Style';
    case 'object':
    default:
      return 'Object';
  }
}

function typeAccent(type: ElementType) {
  switch (type) {
    case 'character':
      return 'border-status-success/30 bg-status-success-muted/40 text-status-success';
    case 'location':
      return 'border-accent-primary/30 bg-accent-primary-muted/30 text-accent-primary';
    case 'style':
      return 'border-status-warning-border bg-status-warning-muted text-status-warning';
    case 'object':
    default:
      return 'border-border bg-canvas text-text-body';
  }
}

function countScenesForElement(scenes: Scene[], elementId: string) {
  return scenes.filter((scene) => scene.elementIds?.includes(elementId)).length;
}

export function ElementLibrary({ projectId }: ElementLibraryProps) {
  const { projects, activeSceneId, setActiveScene } = useAppStore(
    useShallow((state) => ({
      projects: state.projects,
      activeSceneId: state.activeSceneId,
      setActiveScene: state.setActiveScene,
    })),
  );

  const project = projects.find((item) => item.id === projectId) ?? null;

  const elements = useMemo(() => {
    if (!project) {
      return [];
    }

    return (project.elements ?? []).map((element) => ({
      element,
      sceneCount: countScenesForElement(project.scenes, element.id),
      linkedScenes: project.scenes.filter((scene) => scene.elementIds?.includes(element.id)),
    }));
  }, [project]);

  if (!project) {
    return null;
  }

  return (
    <div className="flex flex-col border-t border-border">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Shapes className="h-4 w-4 text-text-muted" aria-hidden="true" />
          <h3 className="type-ui text-text-primary">Elements</h3>
          {elements.length > 0 ? (
            <span className="rounded-full border border-border bg-surface px-2 py-0.5 type-caption text-text-body">
              {elements.length}
            </span>
          ) : null}
        </div>
        <p className="mt-1 type-caption text-text-body">
          Project-wide continuity objects for characters, props, locations, and style cues.
        </p>
      </div>

      <div className="max-h-[260px] space-y-2 overflow-y-auto px-3 pb-3">
        {elements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center">
            <Sparkles className="mx-auto h-5 w-5 text-text-muted" aria-hidden="true" />
            <p className="mt-2 type-ui text-text-primary">No Elements yet</p>
            <p className="mt-1 type-caption text-text-body">
              Approved script imports will start building shared continuity objects here.
            </p>
          </div>
        ) : (
          elements.map(({ element, sceneCount, linkedScenes }) => {
            const Icon = typeIcon(element.type);

            return (
              <article
                key={element.id}
                className="rounded-xl border border-border bg-elevated/80 px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: element.color }}
                    aria-hidden="true"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate type-section text-text-primary">{element.name}</p>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 type-caption',
                          typeAccent(element.type),
                        )}
                      >
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {typeLabel(element.type)}
                      </span>
                      <span className="rounded-full border border-border bg-surface px-2 py-0.5 type-caption text-text-body">
                        {sceneCount} scene{sceneCount !== 1 ? 's' : ''}
                      </span>
                      {element.referenceSetIds.length > 0 ? (
                        <span className="rounded-full border border-border bg-surface px-2 py-0.5 type-caption text-text-body">
                          {element.referenceSetIds.length} reference{element.referenceSetIds.length !== 1 ? 's' : ''}
                        </span>
                      ) : null}
                    </div>

                    {element.description ? (
                      <p className="mt-2 type-caption text-text-body">{element.description}</p>
                    ) : null}

                    {element.continuityNotes ? (
                      <p className="mt-2 type-caption text-text-primary">{element.continuityNotes}</p>
                    ) : null}

                    {linkedScenes.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {linkedScenes.map((scene) => (
                          <Button
                            key={`${element.id}-${scene.id}`}
                            variant={scene.id === activeSceneId ? 'primary' : 'secondary'}
                            size="sm"
                            onClick={() => setActiveScene(scene.id)}
                          >
                            {scene.name}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
