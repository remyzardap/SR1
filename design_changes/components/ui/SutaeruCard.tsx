import React from 'react';
import { cn } from '@/lib/utils';

/**
 * SUTAERU Card Component
 * 
 * A minimal, premium card component for the SUTAERU design system.
 * Features dark backgrounds, subtle borders, and minimal hover states.
 * 
 * @example
 * <SutaeruCard>
 *   <h3>Card Title</h3>
 *   <p>Card content goes here</p>
 * </SutaeruCard>
 * 
 * <SutaeruCard onClick={() => handleClick()} className="cursor-pointer">
 *   <p>Clickable card</p>
 * </SutaeruCard>
 */

export interface SutaeruCardProps {
  /** Card content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Optional click handler - adds pointer cursor and enhanced hover */
  onClick?: () => void;
  /** Card padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Border style variant */
  variant?: 'default' | 'subtle' | 'elevated';
}

export function SutaeruCard({
  children,
  className,
  onClick,
  padding = 'md',
  variant = 'default',
}: SutaeruCardProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const variantClasses = {
    default: 'bg-[#111111] border-[#222222]',
    subtle: 'bg-[#0a0a0a] border-[#1a1a1a]',
    elevated: 'bg-[#141414] border-[#2a2a2a]',
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        // Base styles
        'relative rounded-[2px] border transition-all duration-150',
        
        // Variant styles
        variantClasses[variant],
        
        // Padding
        paddingClasses[padding],
        
        // Hover states
        'hover:border-[#444444]',
        variant === 'elevated' && 'hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)]',
        
        // Clickable state
        onClick && 'cursor-pointer active:bg-[#0d0d0d]',
        
        // Custom classes
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * SUTAERU Card Header
 * 
 * Pre-styled header section for SutaeruCard.
 */
export interface SutaeruCardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function SutaeruCardHeader({ children, className }: SutaeruCardHeaderProps) {
  return (
    <div className={cn('mb-4', className)}>
      {children}
    </div>
  );
}

/**
 * SUTAERU Card Title
 * 
 * Pre-styled title for SutaeruCard.
 */
export interface SutaeruCardTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function SutaeruCardTitle({ children, className }: SutaeruCardTitleProps) {
  return (
    <h3
      className={cn(
        'text-[#f5f5f5] text-lg font-medium tracking-wide uppercase',
        className
      )}
    >
      {children}
    </h3>
  );
}

/**
 * SUTAERU Card Description
 * 
 * Pre-styled description text for SutaeruCard.
 */
export interface SutaeruCardDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function SutaeruCardDescription({ children, className }: SutaeruCardDescriptionProps) {
  return (
    <p
      className={cn(
        'text-[#888888] text-sm mt-1 leading-relaxed',
        className
      )}
    >
      {children}
    </p>
  );
}

/**
 * SUTAERU Card Content
 * 
 * Pre-styled content section for SutaeruCard.
 */
export interface SutaeruCardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function SutaeruCardContent({ children, className }: SutaeruCardContentProps) {
  return (
    <div className={cn('text-[#cccccc]', className)}>
      {children}
    </div>
  );
}

/**
 * SUTAERU Card Footer
 * 
 * Pre-styled footer section for SutaeruCard.
 */
export interface SutaeruCardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function SutaeruCardFooter({ children, className }: SutaeruCardFooterProps) {
  return (
    <div
      className={cn(
        'mt-4 pt-4 border-t border-[#222222] flex items-center gap-3',
        className
      )}
    >
      {children}
    </div>
  );
}

export default SutaeruCard;
