import type { Transition, Variant } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Hook that returns Framer Motion transition and variant configs
 * that respect the user's prefers-reduced-motion setting.
 *
 * When reduced motion is preferred, all transitions become instant
 * and AnimatePresence exit animations are skipped.
 */
export function useMotionConfig() {
  const reduced = useReducedMotion();

  return {
    /** True when user prefers reduced motion; skip all animations */
    reduced,
    /** Transition config: instant when reduced, otherwise smooth */
    transition: (reduced
      ? { duration: 0 }
      : { duration: 0.2, ease: 'easeOut' }) as Transition,
    /** Spring transition: instant when reduced, otherwise spring */
    springTransition: (reduced
      ? { duration: 0 }
      : { type: 'spring', stiffness: 400, damping: 30 }) as Transition,
    /** Fade-in variant that skips animation when reduced */
    fadeIn: {
      initial: reduced ? {} : { opacity: 0, y: -10 },
      animate: { opacity: 1, y: 0 },
      exit: reduced ? {} : { opacity: 0, y: -10 },
    } as Record<string, Variant>,
    /** Scale-in variant that skips animation when reduced */
    scaleIn: {
      initial: reduced ? {} : { opacity: 0, scale: 0.98 },
      animate: { opacity: 1, scale: 1 },
      exit: reduced ? {} : { opacity: 0, scale: 0.98 },
    } as Record<string, Variant>,
    /** Slide-in from left variant */
    slideInLeft: {
      initial: reduced ? {} : { opacity: 0, x: -20 },
      animate: { opacity: 1, x: 0 },
      exit: reduced ? {} : { opacity: 0, x: -20 },
    } as Record<string, Variant>,
  };
}