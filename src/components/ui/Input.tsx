import { cn } from '@/utils/cn';
import { LucideIcon } from 'lucide-react';
import { forwardRef, useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: LucideIcon;
  helper?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon: Icon, helper, type, id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const inputId = externalId ?? generatedId;

    // Build aria-describedby from error/helper messages
    const helperId = helper ? `${inputId}-helper` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = [props['aria-describedby'], helper && !error ? helperId : undefined, error ? errorId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

    const isNumeric = type === 'number';

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="text-label text-text-body">
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            aria-describedby={describedBy}
            className={cn(
              'w-full bg-elevated border border-border rounded-md text-text-primary placeholder:text-text-muted',
              'focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/35 transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'px-3 py-2 text-sm',
              Icon && 'pl-10',
              isNumeric && 'font-mono',
              error && 'border-red-primary focus:border-red-primary focus:ring-red-primary',
              className
            )}
            {...props}
          />
        </div>
        {helper && !error && (
          <p id={helperId} className="text-xs text-text-muted">{helper}</p>
        )}
        {error && (
          <p id={errorId} className="text-xs text-red-primary">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
