import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface CinematicTransitionProps {
  transitionKey: string;
  children: React.ReactNode;
}

export const CinematicTransition = memo(function CinematicTransition({ transitionKey, children }: CinematicTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={transitionKey}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{
          enter: { duration: 0.2, delay: 0.05, ease: 'easeOut' },
          exit: { duration: 0.15, ease: 'easeIn' },
        }}
        className="w-full flex-1 min-h-0 flex flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
});
