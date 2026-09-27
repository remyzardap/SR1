import React from 'react';
import { cn } from '@/lib/utils';

/**
 * SUTAERU Logo Component
 * 
 * The sacred tree symbol representing the soul-cloud app.
 * Features a wide trunk, rounded crown with hanging tendril branches,
 * and the SUTAERU wordmark below.
 * 
 * Tagline: "Your persistent AI identity in the cloud"
 * 
 * @example
 * <SutaeruLogo size="md" variant="light" />
 * <SutaeruLogo size="lg" variant="dark" showTagline />
 */

export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';
export type LogoVariant = 'dark' | 'light';

export interface SutaeruLogoProps {
  /** Logo size */
  size?: LogoSize;
  /** Color variant - dark for light backgrounds, light for dark backgrounds */
  variant?: LogoVariant;
  /** Show the tagline below the logo */
  showTagline?: boolean;
  /** Custom tagline text */
  tagline?: string;
  /** Additional CSS classes */
  className?: string;
  /** Optional click handler */
  onClick?: () => void;
}

export function SutaeruLogo({
  size = 'md',
  variant = 'light',
  showTagline = false,
  tagline = 'Your persistent AI identity in the cloud',
  className,
  onClick,
}: SutaeruLogoProps) {
  // Size configurations
  const sizeConfig = {
    sm: {
      containerWidth: 80,
      treeHeight: 48,
      fontSize: 'text-xs',
      taglineSize: 'text-[8px]',
      spacing: 'mt-2',
      letterSpacing: 'tracking-[0.15em]',
    },
    md: {
      containerWidth: 120,
      treeHeight: 72,
      fontSize: 'text-sm',
      taglineSize: 'text-[10px]',
      spacing: 'mt-3',
      letterSpacing: 'tracking-[0.18em]',
    },
    lg: {
      containerWidth: 160,
      treeHeight: 96,
      fontSize: 'text-base',
      taglineSize: 'text-xs',
      spacing: 'mt-4',
      letterSpacing: 'tracking-[0.2em]',
    },
    xl: {
      containerWidth: 240,
      treeHeight: 144,
      fontSize: 'text-lg',
      taglineSize: 'text-sm',
      spacing: 'mt-5',
      letterSpacing: 'tracking-[0.22em]',
    },
  };

  const config = sizeConfig[size];

  // Color based on variant
  const colors = {
    dark: {
      tree: '#000000',
      text: '#000000',
      tagline: '#444444',
    },
    light: {
      tree: '#ffffff',
      text: '#ffffff',
      tagline: '#888888',
    },
  };

  const theme = colors[variant];

  return (
    <div
      onClick={onClick}
      className={cn(
        'inline-flex flex-col items-center',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {/* Sacred Tree SVG */}
      <svg
        width={config.containerWidth}
        height={config.treeHeight}
        viewBox="0 0 120 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        {/* Tree crown - rounded top */}
        <ellipse
          cx="60"
          cy="22"
          rx="35"
          ry="18"
          fill={theme.tree}
        />
        
        {/* Crown detail - inner ellipse for depth */}
        <ellipse
          cx="60"
          cy="22"
          rx="25"
          ry="12"
          fill="none"
          stroke={variant === 'light' ? '#111111' : '#f5f5f5'}
          strokeWidth="0.5"
          opacity="0.3"
        />
        
        {/* Main trunk - wide at base, tapering up */}
        <path
          d={`
            M 52 35
            L 48 68
            Q 48 72 52 72
            L 68 72
            Q 72 72 72 68
            L 68 35
            Q 60 32 52 35
            Z
          `}
          fill={theme.tree}
        />
        
        {/* Trunk texture line */}
        <path
          d="M 60 38 L 60 68"
          stroke={variant === 'light' ? '#222222' : '#e5e5e5'}
          strokeWidth="0.5"
          opacity="0.2"
        />
        
        {/* Left branch - thick */}
        <path
          d="M 52 42 Q 35 45 25 38"
          stroke={theme.tree}
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Right branch - thick */}
        <path
          d="M 68 42 Q 85 45 95 38"
          stroke={theme.tree}
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Upper left branch */}
        <path
          d="M 54 32 Q 40 30 32 22"
          stroke={theme.tree}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Upper right branch */}
        <path
          d="M 66 32 Q 80 30 88 22"
          stroke={theme.tree}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Hanging tendrils - left side */}
        {/* Tendril 1 */}
        <path
          d="M 28 38 Q 26 50 28 58"
          stroke={theme.tree}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />
        {/* Tendril 2 */}
        <path
          d="M 22 35 Q 20 48 23 55"
          stroke={theme.tree}
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          opacity="0.6"
        />
        {/* Tendril 3 */}
        <path
          d="M 35 40 Q 33 52 36 60"
          stroke={theme.tree}
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          opacity="0.5"
        />
        
        {/* Hanging tendrils - right side */}
        {/* Tendril 4 */}
        <path
          d="M 92 38 Q 94 50 92 58"
          stroke={theme.tree}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />
        {/* Tendril 5 */}
        <path
          d="M 98 35 Q 100 48 97 55"
          stroke={theme.tree}
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          opacity="0.6"
        />
        {/* Tendril 6 */}
        <path
          d="M 85 40 Q 87 52 84 60"
          stroke={theme.tree}
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          opacity="0.5"
        />
        
        {/* Center tendrils from crown */}
        <path
          d="M 50 28 Q 48 38 50 48"
          stroke={theme.tree}
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          opacity="0.4"
        />
        <path
          d="M 70 28 Q 72 38 70 48"
          stroke={theme.tree}
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          opacity="0.4"
        />
        
        {/* Small decorative dots at tendril ends */}
        <circle cx="28" cy="59" r="1.5" fill={theme.tree} opacity="0.6" />
        <circle cx="23" cy="56" r="1" fill={theme.tree} opacity="0.4" />
        <circle cx="92" cy="59" r="1.5" fill={theme.tree} opacity="0.6" />
        <circle cx="97" cy="56" r="1" fill={theme.tree} opacity="0.4" />
        
        {/* Root hints at base */}
        <path
          d="M 48 70 Q 42 72 38 70"
          stroke={theme.tree}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity="0.5"
        />
        <path
          d="M 72 70 Q 78 72 82 70"
          stroke={theme.tree}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity="0.5"
        />
      </svg>

      {/* SUTAERU Wordmark */}
      <span
        className={cn(
          'font-medium uppercase',
          config.fontSize,
          config.letterSpacing,
          config.spacing
        )}
        style={{ color: theme.text }}
      >
        SUTAERU
      </span>

      {/* Optional Tagline */}
      {showTagline && (
        <span
          className={cn(
            'mt-1 font-normal',
            config.taglineSize,
            'tracking-wide'
          )}
          style={{ color: theme.tagline }}
        />
      )}
    </div>
  );
}

/**
 * SUTAERU Logo Icon
 * 
 * Just the sacred tree symbol without the wordmark.
 */
export interface SutaeruLogoIconProps {
  /** Icon size in pixels */
  size?: number;
  /** Color variant */
  variant?: LogoVariant;
  /** Additional CSS classes */
  className?: string;
  /** Optional click handler */
  onClick?: () => void;
}

export function SutaeruLogoIcon({
  size = 40,
  variant = 'light',
  className,
  onClick,
}: SutaeruLogoIconProps) {
  const colors = {
    dark: '#000000',
    light: '#ffffff',
  };

  const theme = colors[variant];

  return (
    <svg
      width={size}
      height={size * 0.6}
      viewBox="0 0 120 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      onClick={onClick}
      className={cn(onClick && 'cursor-pointer', className)}
    >
      {/* Tree crown */}
      <ellipse
        cx="60"
        cy="22"
        rx="35"
        ry="18"
        fill={theme}
      />
      
      {/* Main trunk */}
      <path
        d="M 52 35 L 48 68 Q 48 72 52 72 L 68 72 Q 72 72 72 68 L 68 35 Q 60 32 52 35 Z"
        fill={theme}
      />
      
      {/* Left branch */}
      <path
        d="M 52 42 Q 35 45 25 38"
        stroke={theme}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      
      {/* Right branch */}
      <path
        d="M 68 42 Q 85 45 95 38"
        stroke={theme}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      
      {/* Upper left branch */}
      <path
        d="M 54 32 Q 40 30 32 22"
        stroke={theme}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      
      {/* Upper right branch */}
      <path
        d="M 66 32 Q 80 30 88 22"
        stroke={theme}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      
      {/* Hanging tendrils */}
      <path
        d="M 28 38 Q 26 50 28 58"
        stroke={theme}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />
      <path
        d="M 92 38 Q 94 50 92 58"
        stroke={theme}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />
      <path
        d="M 22 35 Q 20 48 23 55"
        stroke={theme}
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
      <path
        d="M 98 35 Q 100 48 97 55"
        stroke={theme}
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
      
      {/* Decorative dots */}
      <circle cx="28" cy="59" r="1.5" fill={theme} opacity="0.6" />
      <circle cx="92" cy="59" r="1.5" fill={theme} opacity="0.6" />
    </svg>
  );
}

/**
 * SUTAERU Wordmark Only
 * 
 * Just the SUTAERU text without the tree symbol.
 */
export interface SutaeruWordmarkProps {
  /** Text size */
  size?: LogoSize;
  /** Color variant */
  variant?: LogoVariant;
  /** Additional CSS classes */
  className?: string;
}

export function SutaeruWordmark({
  size = 'md',
  variant = 'light',
  className,
}: SutaeruWordmarkProps) {
  const sizeConfig = {
    sm: 'text-xs tracking-[0.15em]',
    md: 'text-sm tracking-[0.18em]',
    lg: 'text-base tracking-[0.2em]',
    xl: 'text-lg tracking-[0.22em]',
  };

  const colors = {
    dark: '#000000',
    light: '#ffffff',
  };

  return (
    <span
      className={cn(
        'font-medium uppercase',
        sizeConfig[size],
        className
      )}
      style={{ color: colors[variant] }}
    >
      SUTAERU
    </span>
  );
}

export default SutaeruLogo;
