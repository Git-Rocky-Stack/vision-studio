import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface RecessedWellProps {
  children: ReactNode;
  /** Render element. Defaults to div. */
  as?: ElementType;
  /** Inner padding in px. Default 12. Pass 0 for flush data surfaces. */
  padding?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Layer 2 of the depth hierarchy: a container carved INTO a faceplate. Applies
 * the `.recessed-well` recipe (inset top shadow where light doesn't reach +
 * faint bottom highlight). Use for any inner data surface - grids, tables, LCD
 * wells, thumbnail viewports, fader slots, spec strips. See DESIGN.md
 * §Raised Hardware Depth System.
 */
export function RecessedWell({
  children,
  as: Tag = 'div',
  padding = 12,
  className,
  style,
}: RecessedWellProps) {
  return (
    <Tag className={cn('recessed-well', className)} style={{ padding, ...style }}>
      {children}
    </Tag>
  );
}
