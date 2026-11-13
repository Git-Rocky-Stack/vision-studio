import path from 'path';
import type { AppSettings } from '../../shared/ipcTypes';

// The settings shape is part of the IPC contract (shared/ipcTypes.ts), so the
// renderer, the settings:update validator and this service read one type.
export type { AppSettings, ResolvedAppSettings } from '../../shared/ipcTypes';

export function resolveOutputPath(
  settings: Pick<AppSettings, 'defaultOutputPath'>,
  userDataPath: string
) {
  const configuredPath = settings.defaultOutputPath?.trim();
  const resolvedPath = configuredPath || path.join(userDataPath, 'outputs');
  return resolvedPath.replace(/\\/g, '/');
}

export function shouldRestartBackend(
  currentSettings: Partial<AppSettings>,
  nextSettings: Partial<AppSettings>
) {
  // The backend is told its output folder at spawn time, so a change needs a
  // restart. (The interpreter is env-only - VISION_STUDIO_PYTHON - never a setting.)
  const currentOutputPath = (currentSettings.defaultOutputPath || '').trim();
  const nextOutputPath = (nextSettings.defaultOutputPath || '').trim();

  return currentOutputPath !== nextOutputPath;
}
