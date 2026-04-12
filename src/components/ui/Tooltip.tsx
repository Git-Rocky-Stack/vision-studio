import { useState, cloneElement, type ReactElement, useCallback } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  type Placement,
} from '@floating-ui/react';
import { cn } from '@/utils/cn';
import { AnimatePresence, motion } from 'framer-motion';

interface TooltipProps {
  content: string;
  placement?: Placement;
  children: ReactElement;
  delay?: number;
}

export function Tooltip({
  content,
  placement = 'top',
  children,
  delay = 400,
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });

  const hover = useHover(context, { delay: { open: delay, close: 0 } });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  // Keyboard trigger for tooltip (Enter/Space to toggle)
  const handleReferenceKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    },
    []
  );

  return (
    <>
      {cloneElement(children, {
        ref: refs.setReference,
        ...getReferenceProps(),
        onKeyDown: (event: React.KeyboardEvent) => {
          getReferenceProps().onKeyDown?.(event);
          handleReferenceKeyDown(event);
        },
      })}
      <FloatingPortal>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={refs.setFloating}
              style={floatingStyles}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              {...getFloatingProps()}
              className={cn(
                'z-[var(--z-tooltip)] px-2.5 py-1.5 rounded-lg',
                'bg-elevated border border-border shadow-cinematic',
                'font-display text-xs text-text-primary',
                'pointer-events-none whitespace-nowrap'
              )}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}
