import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import './fonts';
import './index.css';
import App from './App';

// Framer Motion animates through inline styles, which the reduced-motion block
// in index.css cannot reach. reducedMotion="user" makes every motion component
// honour the OS setting by skipping transform and layout animations. Opacity
// and colour still animate, so an infinite opacity loop must check
// useReducedMotion itself (GenerationProgress does).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
