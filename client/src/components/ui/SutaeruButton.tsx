import React from 'react';
import { cn } from '@/lib/utils';

/**
 * SUTAERU Button Component
 * 
 * A minimal, premium button component for the SUTAERU design system.
 * Features three variants: primary, ghost, and danger.
 * 
 * @example
 * <SutaeruButton variant="primary">Create Agent</SutaeruButton>
 * <SutaeruButton variant="ghost">Cancel</SutaeruButton>
 * <SutaeruButton variant="danger" size="sm">Delete</SutaeruButton>
 * <SutaeruButton disabled>Loading...</SutaeruButton>
 */

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface SutaeruButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button content */
  children: React.ReactNode;
  /** Visual variant */
  variant?: ButtonVariant;
  /** Size variant */
  size?: ButtonSize;
  /** Full width button */
  fullWidth?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function SutaeruButton({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled,
  className,
  ...props
}: SutaeruButtonProps) {
  const sizeClasses = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  };

  const variantClasses: Record<ButtonVariant, string> = {
    primary: cn(
      'bg-white text-black border border-black',
      'hover:bg-[#f5f5f5] hover:border-[#333333]',
      'active:bg-[#e5e5e5]',
      'disabled:bg-[#444444] disabled:text-[#888888] disabled:border-[#444444]'
    ),
    ghost: cn(
      'bg-transparent text-white border border-white',
      'hover:bg-white/5 hover:border-[#cccccc]',
      'active:bg-white/10',
      'disabled:text-[#666666] disabled:border-[#333333]'
    ),
    danger: cn(
      'bg-transparent text-[#888888] border border-[#444444]',
      'hover:text-white hover:border-white hover:bg-white/5',
      'active:bg-white/10',
      'disabled:text-[#444444] disabled:border-[#222222]'
    ),
  };

  return (
    <button
      disabled={disabled || loading}
      className={cn(
        // Base styles
        'relative inline-flex items-center justify-center',
        'font-medium tracking-wide uppercase',
        'rounded-[2px]',
        'transition-all duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]',
        
        // Size
        sizeClasses[size],
        
        // Variant
        variantClasses[variant],
        
        // Width
        fullWidth && 'w-full',
        
        // Loading state
        loading && 'cursor-wait opacity-80',
        
        // Disabled state (additional)
        (disabled || loading) && 'cursor-not-allowed',
        
        // Custom classes
        className
      )}
      {...props}
    >
      {/* Loading spinner */}
      {loading && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </span>
      )}
      
      {/* Button content */}
      <span className={cn(loading && 'invisible')}>
        {children}
      </span>
    </button>
  );
}

/**
 * SUTAERU Button Group
 * 
 * Groups multiple buttons with consistent spacing.
 */
export interface SutaeruButtonGroupProps {
  children: React.ReactNode;
  className?: string;
  /** Horizontal or vertical layout */
  direction?: 'horizontal' | 'vertical';
  /** Gap size between buttons */
  gap?: 'sm' | 'md' | 'lg';
}

export function SutaeruButtonGroup({
  children,
  className,
  direction = 'horizontal',
  gap = 'md',
}: SutaeruButtonGroupProps) {
  const gapClasses = {
    sm: direction === 'horizontal' ? 'gap-2' : 'flex-col gap-2',
    md: direction === 'horizontal' ? 'gap-3' : 'flex-col gap-3',
    lg: direction === 'horizontal' ? 'gap-4' : 'flex-col gap-4',
  };

  return (
    <div
      className={cn(
        'flex',
        gapClasses[gap],
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * SUTAERU Icon Button
 * 
 * A square button designed for icons.
 */
export interface SutaeruIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon element */
  icon: React.ReactNode;
  /** Visual variant */
  variant?: ButtonVariant;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Accessible label */
  ariaLabel: string;
  /** Additional CSS classes */
  className?: string;
}

export function SutaeruIconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  ariaLabel,
  className,
  ...props
}: SutaeruIconButtonProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  const variantClasses: Record<ButtonVariant, string> = {
    primary: cn(
      'bg-white text-black',
      'hover:bg-[#f5f5f5]',
      'active:bg-[#e5e5e5]',
      'disabled:bg-[#444444] disabled:text-[#888888]'
    ),
    ghost: cn(
      'bg-transparent text-white',
      'hover:bg-white/5',
      'active:bg-white/10',
      'disabled:text-[#666666]'
    ),
    danger: cn(
      'bg-transparent text-[#888888]',
      'hover:text-white hover:bg-white/5',
      'active:bg-white/10',
      'disabled:text-[#444444]'
    ),
  };

  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        // Base styles
        'inline-flex items-center justify-center',
        'rounded-[2px]',
        'transition-all duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]',
        
        // Size
        sizeClasses[size],
        
        // Variant
        variantClasses[variant],
        
        // Custom classes
        className
      )}
      {...props}
    >
      {icon}
    </button>
  );
}

export default SutaeruButton;
