/**
 * SegmentedToggle - Premium animated tab/toggle component
 *
 * Features:
 * - Animated pill indicator that slides between options
 * - Uses Framer Motion layoutId for smooth transitions
 * - Supports icons and labels
 * - Keyboard accessible
 * - Glassmorphism styling
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { springs } from '@/lib/animations';
import { ReactNode, useId } from 'react';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Show label only when active */
  labelOnlyWhenActive?: boolean;
}

interface SegmentedToggleProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Visual style */
  variant?: 'default' | 'glass' | 'solid';
  /** Full width container */
  fullWidth?: boolean;
  /** Custom class for container */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

export function SegmentedToggle<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  variant = 'default',
  fullWidth = false,
  className,
  disabled = false,
}: SegmentedToggleProps<T>) {
  // Generate unique layoutId for this instance
  const instanceId = useId();
  const pillLayoutId = `segmented-pill-${instanceId}`;

  // Size classes
  const sizeClasses = {
    sm: {
      container: 'p-0.5 gap-0.5 rounded-lg',
      button: 'h-7 px-2 text-xs rounded-md',
      icon: 'w-3.5 h-3.5',
    },
    md: {
      container: 'p-1 gap-0.5 rounded-xl',
      button: 'h-8 px-3 text-sm rounded-lg',
      icon: 'w-4 h-4',
    },
    lg: {
      container: 'p-1.5 gap-1 rounded-2xl',
      button: 'h-10 px-4 text-base rounded-xl',
      icon: 'w-5 h-5',
    },
  };

  // Variant classes for container
  const variantClasses = {
    default: 'bg-secondary/50 border border-border/30',
    glass: 'glass-subtle',
    solid: 'bg-muted border border-border',
  };

  const sizes = sizeClasses[size];
  const variantClass = variantClasses[variant];

  return (
    <div
      role="tablist"
      aria-label="View mode"
      className={cn(
        'inline-flex items-center',
        sizes.container,
        variantClass,
        fullWidth && 'w-full',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        const showLabel = !option.labelOnlyWhenActive || isActive;

        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${option.value}`}
            onClick={() => !disabled && onChange(option.value)}
            disabled={disabled}
            className={cn(
              'relative flex items-center justify-center gap-1.5',
              'font-medium transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
              sizes.button,
              fullWidth && 'flex-1',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80'
            )}
          >
            {/* Animated background pill */}
            {isActive && (
              <motion.div
                layoutId={pillLayoutId}
                className={cn(
                  'absolute inset-0 rounded-inherit',
                  'bg-background shadow-sm border border-border/50'
                )}
                style={{ borderRadius: 'inherit' }}
                transition={springs.snappy}
              />
            )}

            {/* Content */}
            <span className="relative z-10 flex items-center gap-1.5">
              {option.icon && (
                <span className={sizes.icon}>{option.icon}</span>
              )}
              {showLabel && (
                <motion.span
                  initial={option.labelOnlyWhenActive ? { opacity: 0, width: 0 } : false}
                  animate={
                    option.labelOnlyWhenActive
                      ? { opacity: isActive ? 1 : 0, width: isActive ? 'auto' : 0 }
                      : {}
                  }
                  transition={{ duration: 0.2 }}
                  className={cn(
                    option.labelOnlyWhenActive && 'overflow-hidden whitespace-nowrap'
                  )}
                >
                  {option.label}
                </motion.span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// PRESET CONFIGURATIONS
// =============================================================================

export interface ViewModeOption {
  value: 'preview' | 'code' | 'build';
  label: string;
  icon: ReactNode;
}

// Convenience component for workspace view modes
interface WorkspaceViewToggleProps {
  value: 'preview' | 'code' | 'build';
  onChange: (value: 'preview' | 'code' | 'build') => void;
  className?: string;
}

export function WorkspaceViewToggle({
  value,
  onChange,
  className,
}: WorkspaceViewToggleProps) {
  const options: SegmentOption<'preview' | 'code' | 'build'>[] = [
    {
      value: 'preview',
      label: 'Preview',
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-full h-full"
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
      labelOnlyWhenActive: true,
    },
    {
      value: 'code',
      label: 'Code',
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-full h-full"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      ),
      labelOnlyWhenActive: true,
    },
    {
      value: 'build',
      label: 'Build',
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-full h-full"
        >
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      ),
      labelOnlyWhenActive: true,
    },
  ];

  return (
    <SegmentedToggle
      options={options}
      value={value}
      onChange={onChange}
      size="sm"
      variant="default"
      className={className}
    />
  );
}

export default SegmentedToggle;
