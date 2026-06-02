import { cn } from '@/utils/cn';
import { motion } from 'framer-motion';

// Instrument UI labels are Mono UPPERCASE. Applied inline because the app's
// global resets neutralize the Tailwind `uppercase` / `tracking-*` utilities.
const LABEL_STYLE: React.CSSProperties = { textTransform: 'uppercase', letterSpacing: '0.5px' };

interface ButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd'
  > {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'cinema';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ComponentType<{ className?: string }>;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  isLoading,
  fullWidth,
  className,
  style,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-mono font-medium transition-all duration-200 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:opacity-40 disabled:cursor-not-allowed';

  const variants = {
    // Primary + cinema render as polished chrome metal caps - the website's
    // signature CTA. bg-accent-primary/text-void stay as the base fill and
    // label color beneath the metal gradient (and keep the variant contract);
    // .btn-chrome paints the cap, .vx-btn-chrome drives the hover/press
    // envelope, and .btn-chrome-cinema adds the hero breathing glow.
    primary: 'btn-chrome vx-btn-chrome bg-accent-primary text-void',
    secondary: 'raised-control vx-switch text-text-body hover:text-text-primary',
    ghost: 'text-text-body hover:text-text-primary hover:bg-elevated',
    danger: 'bg-status-error/10 text-status-error border border-status-error/30 hover:bg-status-error/20',
    cinema: 'btn-chrome vx-btn-chrome btn-chrome-cinema bg-accent-primary text-void',
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm gap-2',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2',
  };

  // Chrome caps move on the CSS .vx-btn-chrome envelope (mechanical lift +
  // press detent) instead of framer's spring scale, matching the website's
  // hardware motion. Other variants keep the existing scale feedback.
  const isChrome = variant === 'primary' || variant === 'cinema';
  const motionProps = isChrome
    ? {}
    : {
        whileHover: { scale: disabled ? 1 : 1.02 },
        whileTap: { scale: disabled ? 1 : 0.98 },
      };

  return (
    <motion.button
      {...motionProps}
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className
      )}
      style={{ ...LABEL_STYLE, ...style }}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading...</span>
        </>
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className="w-4 h-4" />}
          {children}
          {Icon && iconPosition === 'right' && <Icon className="w-4 h-4" />}
        </>
      )}
    </motion.button>
  );
}
