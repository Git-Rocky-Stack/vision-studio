import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import './fonts';
import './index.css';
import App from './App';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { installGlobalErrorHandlers } from '@/components/ui/ErrorBoundaryReporting';
import { whenAppStoreHydrated } from '@/store/appStore';
// Registers the notice host's lazy mounter, so a notice pushed from the store
// or a global handler before any UI imports the host still renders.
import '@/features/notices';

// #J6: a promise rejection nobody awaited, or an error thrown outside React's
// render, is logged with context and surfaced as a notice instead of dying
// silently in the console.
installGlobalErrorHandlers();

// Framer Motion animates through inline styles, which the reduced-motion block
// in index.css cannot reach. reducedMotion="user" makes every motion component
// honour the OS setting by skipping transform and layout animations. Opacity
// and colour still animate, so an infinite opacity loop must check
// useReducedMotion itself (GenerationProgress does).
//
// The root boundary (#J5) covers everything App renders outside the workspace
// boundary: Header, KeyboardShortcuts and FirstRunProvisioning.
//
// The persisted workspace loads from IndexedDB asynchronously (#J3). Rendering
// waits for it (bounded by a timeout) so the first frame is the user's
// workspace, not the defaults flashing into it.
const root = createRoot(document.getElementById('root')!);
void whenAppStoreHydrated().finally(() => {
  root.render(
    <StrictMode>
      <MotionConfig reducedMotion="user">
        <ErrorBoundary fallbackLabel="Vision Studio hit an error" fullScreen>
          <App />
        </ErrorBoundary>
      </MotionConfig>
    </StrictMode>,
  );
});
