import { useState, cloneElement, type HTMLProps, type ReactElement, type Ref } from 'react';
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
  useMergeRefs,
  FloatingPortal,
  type Placement,
} from '@floating-ui/react';
import { cn } from '@/utils/cn';
import { AnimatePresence, motion } from 'framer-motion';

interface TooltipProps {
  content: string;
  placement?: Placement;
  children: ReactElement<Record<string, unknown>>;
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

  // WAI-ARIA tooltip pattern: open on focus/hover, dismiss on blur/Escape
  // (useFocus/useHover/useDismiss above). Enter and Space must stay with the
  // wrapped control - capturing them breaks keyboard activation of every
  // tooltip-wrapped button. getReferenceProps composes the trigger's own
  // handlers with the tooltip's instead of clobbering them.
  const triggerRef = useMergeRefs([
    refs.setReference,
    children.props.ref as Ref<Element> | undefined,
  ]);

  return (
    <>
      {cloneElement(
        children,
        getReferenceProps({ ref: triggerRef, ...children.props } as HTMLProps<Element>)
      )}
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
                'z-[var(--z-tooltip)] px-2.5 py-1.5 rounded-md',
                'bg-panel-raised border border-border shadow-cinematic',
                'type-ui text-text-primary',
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
