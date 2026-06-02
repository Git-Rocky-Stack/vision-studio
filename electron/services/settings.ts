import path from 'path';

export interface AppSettings {
  theme?: 'dark' | 'light' | 'system';
  autoSave?: boolean;
  defaultOutputPath?: string;
  backendAutostart?: boolean;
  notifyOnGenerationComplete?: boolean;
  notifyOnGenerationFailed?: boolean;
  notifyOnModelDownloads?: boolean;
  pythonPath?: string;
}

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
  const currentOutputPath = (currentSettings.defaultOutputPath || '').trim();
  const nextOutputPath = (nextSettings.defaultOutputPath || '').trim();
  const currentPythonPath = (currentSettings.pythonPath || '').trim();
  const nextPythonPath = (nextSettings.pythonPath || '').trim();

  return currentOutputPath !== nextOutputPath || currentPythonPath !== nextPythonPath;
}
