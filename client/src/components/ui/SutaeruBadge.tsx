import React from 'react';
import { cn } from '@/lib/utils';

/**
 * SUTAERU Badge Component
 * 
 * Type badges for skill types, memory types, and entity classifications.
 * Ultra-minimal monochrome design system.
 * 
 * @example
 * <SutaeruBadge type="prompt">Prompt</SutaeruBadge>
 * <SutaeruBadge type="workflow" size="lg">Workflow</SutaeruBadge>
 * <SutaeruBadge type="fact" variant="subtle">Fact</SutaeruBadge>
 */

export type BadgeType = 
  | 'prompt'
  | 'workflow'
  | 'tool_definition'
  | 'behavior'
  | 'preference'
  | 'fact'
  | 'project'
  | 'document'
  | 'interaction'
  | 'skill'
  | 'memory'
  | 'agent'
  | 'default';

export type BadgeSize = 'sm' | 'md' | 'lg';
export type BadgeVariant = 'default' | 'subtle' | 'outline';

export interface SutaeruBadgeProps {
  /** Badge text content */
  children: React.ReactNode;
  /** Badge type - determines color scheme */
  type?: BadgeType;
  /** Size variant */
  size?: BadgeSize;
  /** Visual variant */
  variant?: BadgeVariant;
  /** Optional icon before text */
  icon?: React.ReactNode;
  /** Click handler - makes badge interactive */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
}

export function SutaeruBadge({
  children,
  type = 'default',
  size = 'md',
  variant = 'default',
  icon,
  onClick,
  className,
}: SutaeruBadgeProps) {
  const sizeClasses = {
    sm: 'h-5 px-2 text-[10px]',
    md: 'h-6 px-2.5 text-xs',
    lg: 'h-7 px-3 text-sm',
  };

  const getTypeClasses = (type: BadgeType, variant: BadgeVariant): string => {
    const isSignal = type === 'prompt' || type === 'skill' || type === 'agent';
    if (variant === 'outline') return 'bg-transparent text-foreground border-border';
    if (variant === 'subtle') return 'bg-secondary text-muted-foreground border-transparent';
    return isSignal ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border';
  };

  return (
    <span
      onClick={onClick}
      className={cn(
        // Base styles
        'inline-flex items-center gap-1.5',
        'font-medium tracking-wide uppercase',
        'rounded-[2px]',
        'transition-all duration-150',
        
        // Size
        sizeClasses[size],
        
        // Type + Variant styles
        getTypeClasses(type, variant),
        
        // Interactive state
        onClick && 'cursor-pointer hover:opacity-80 active:opacity-60',
        
        // Custom classes
        className
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
}

/**
 * SUTAERU Badge Group
 * 
 * Groups multiple badges with consistent spacing.
 */
export interface SutaeruBadgeGroupProps {
  children: React.ReactNode;
  className?: string;
  /** Gap size between badges */
  gap?: 'sm' | 'md' | 'lg';
  /** Wrap badges to next line */
  wrap?: boolean;
}

export function SutaeruBadgeGroup({
  children,
  className,
  gap = 'sm',
  wrap = true,
}: SutaeruBadgeGroupProps) {
  const gapClasses = {
    sm: 'gap-1.5',
    md: 'gap-2',
    lg: 'gap-3',
  };

  return (
    <div
      className={cn(
        'flex',
        gapClasses[gap],
        wrap && 'flex-wrap',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * SUTAERU Status Badge
 * 
 * Specialized badge for status indicators with dot indicator.
 */
export interface SutaeruStatusBadgeProps {
  /** Badge text */
  children: React.ReactNode;
  /** Status state */
  status: 'active' | 'inactive' | 'pending' | 'error';
  /** Size variant */
  size?: BadgeSize;
  /** Additional CSS classes */
  className?: string;
}

export function SutaeruStatusBadge({
  children,
  status,
  size = 'md',
  className,
}: SutaeruStatusBadgeProps) {
  const statusDotColors = {
    active: 'bg-[var(--neon-orange)]',
    inactive: 'bg-muted-foreground',
    pending: 'bg-[var(--state-warning)] animate-pulse',
    error: 'bg-destructive',
  };

  const sizeClasses = {
    sm: 'h-5 px-2 text-[10px]',
    md: 'h-6 px-2.5 text-xs',
    lg: 'h-7 px-3 text-sm',
  };

  const dotSizes = {
    sm: 'w-1 h-1',
    md: 'w-1.5 h-1.5',
    lg: 'w-2 h-2',
  };

  return (
    <span
      className={cn(
        // Base styles
        'inline-flex items-center gap-2',
        'bg-secondary text-muted-foreground',
        'font-medium tracking-wide uppercase',
        'rounded-[2px]',
        'border border-border',
        
        // Size
        sizeClasses[size],
        
        // Custom classes
        className
      )}
    >
      <span
        className={cn(
          'rounded-full',
          statusDotColors[status],
          dotSizes[size]
        )}
      />
      {children}
    </span>
  );
}

/**
 * SUTAERU Count Badge
 * 
 * Badge with a count number, often used for notifications.
 */
export interface SutaeruCountBadgeProps {
  /** The count to display */
  count: number;
  /** Max count before showing "99+" */
  max?: number;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional CSS classes */
  className?: string;
}

export function SutaeruCountBadge({
  count,
  max = 99,
  size = 'sm',
  className,
}: SutaeruCountBadgeProps) {
  const displayCount = count > max ? `${max}+` : count.toString();

  const sizeClasses = {
    sm: 'min-w-[18px] h-[18px] px-1 text-[10px]',
    md: 'min-w-[22px] h-[22px] px-1.5 text-xs',
  };

  return (
    <span
      className={cn(
        // Base styles
        'inline-flex items-center justify-center',
        'bg-primary text-primary-foreground',
        'font-semibold',
        'rounded-full',
        
        // Size
        sizeClasses[size],
        
        // Custom classes
        className
      )}
    >
      {displayCount}
    </span>
  );
}

export default SutaeruBadge;
