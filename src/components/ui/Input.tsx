import { cn } from '@/utils/cn';
import { LucideIcon } from 'lucide-react';
import { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: LucideIcon;
  helper?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon: Icon, helper, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-light-grey">
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-silver" />
          )}
          <input
            ref={ref}
            className={cn(
              'w-full bg-charcoal border border-border rounded-lg text-white placeholder:text-silver/50',
              'focus:border-red focus:ring-1 focus:ring-red transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              Icon && 'pl-10',
              error && 'border-red focus:border-red focus:ring-red',
              className
            )}
            {...props}
          />
        </div>
        {helper && !error && (
          <p className="text-xs text-silver">{helper}</p>
        )}
        {error && (
          <p className="text-xs text-red">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
