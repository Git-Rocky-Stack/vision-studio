// Apply the persisted theme before first paint, so a light-theme user never
// sees a dark flash. A classic, render-blocking script in <head>: it must run
// before the body paints. Shipped as a file (not inline) because the CSP
// allows no inline scripts. Mirrors the store's persisted `theme` field.
(function applyPersistedTheme() {
  try {
    var stored = JSON.parse(window.localStorage.getItem('vision-studio-storage') || '{}');
    var theme = (stored.state && stored.state.theme) || 'dark';
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  } catch (error) {
    // Storage unavailable or corrupt: keep the default dark theme.
  }
})();
