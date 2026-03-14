export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export function resolveThemeMode(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }

  return preference;
}

export function applyThemeToDocument(
  preference: ThemePreference,
  systemPrefersDark: boolean,
  target: {
    documentElement: { dataset: Record<string, string>; style: { colorScheme: string } };
    body: { dataset: Record<string, string> };
  } = document
) {
  const resolvedTheme = resolveThemeMode(preference, systemPrefersDark);
  target.documentElement.dataset.theme = resolvedTheme;
  target.documentElement.style.colorScheme = resolvedTheme;
  target.body.dataset.theme = resolvedTheme;
  return resolvedTheme;
}
