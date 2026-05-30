/**
 * IBM Plex type system - bundled locally via @fontsource.
 *
 * Mirrors the Vision Studio-X website typography (DESIGN.md §Typography).
 * We bundle the fonts instead of pulling Google Fonts at runtime: Vision Studio
 * is a local-first, privacy-first desktop app - it must render correctly offline
 * and never phone home to a CDN on launch.
 *
 *   Display (heroes, instrument labels) → IBM Plex Sans Condensed  400/500/600/700
 *   Body & UI                           → IBM Plex Sans            300/400/500/600/700
 *   Mono / data / UI labels             → IBM Plex Mono            400/500/600
 *
 * Only the `latin` + `latin-ext` subsets are imported (Western European coverage
 * for UI chrome and user prompts); mono stays latin-only since data/labels are ASCII.
 * Keep the imported weights in sync with the @theme font tokens in index.css.
 */

// IBM Plex Sans Condensed - display
import '@fontsource/ibm-plex-sans-condensed/latin-400.css';
import '@fontsource/ibm-plex-sans-condensed/latin-500.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-700.css';
import '@fontsource/ibm-plex-sans-condensed/latin-ext-400.css';
import '@fontsource/ibm-plex-sans-condensed/latin-ext-500.css';
import '@fontsource/ibm-plex-sans-condensed/latin-ext-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-ext-700.css';

// IBM Plex Sans - body & UI
import '@fontsource/ibm-plex-sans/latin-300.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-sans/latin-ext-400.css';
import '@fontsource/ibm-plex-sans/latin-ext-600.css';

// IBM Plex Mono - data & labels
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
