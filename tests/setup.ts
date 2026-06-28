import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';
import { vi } from 'vitest';

// Testing Library's findBy*/waitFor helpers use their own asyncUtilTimeout
// (default 1000ms), which is independent of Vitest's testTimeout. Under the
// full-suite husky gate, high worker parallelism saturates CPU and a 1s window
// flakes on async data assertions even though every file passes in isolation.
// Raise the ceiling to keep the gate reliable without masking genuine hangs
// (the 20s/40s testTimeout still bounds true deadlocks).
configure({ asyncUtilTimeout: 5000 });

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
}
