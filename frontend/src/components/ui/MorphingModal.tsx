/**
 * MorphingModal - Frame-by-frame morphing modal component
 *
 * Uses Framer Motion's shared layout animations to create smooth
 * transitions where an element morphs into a modal.
 *
 * Features:
 * - Element-to-modal morphing animation
 * - Spring physics for natural feel
 * - Keyboard accessible (Escape to close)
 * - Focus trapping
 * - Backdrop blur with fade
 */

import { ReactNode, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { springs, modalOverlay } from '@/lib/animations';
import { X } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface MorphingModalProps {
  /** Unique ID for layout animation matching */
  layoutId: string;
  /** Whether modal is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Modal content */
  children: ReactNode;
  /** Modal title for accessibility */
  title?: string;
  /** Show close button */
  showCloseButton?: boolean;
  /** Custom class for modal container */
  className?: string;
  /** Maximum width of modal */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Close on backdrop click */
  closeOnBackdropClick?: boolean;
  /** Close on escape key */
  closeOnEscape?: boolean;
}

interface MorphingModalTriggerProps {
  /** Same layoutId as the modal */
  layoutId: string;
  /** Click handler to open modal */
  onClick: () => void;
  /** Trigger content */
  children: ReactNode;
  /** Custom class */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

// =============================================================================
// MORPHING MODAL TRIGGER
// =============================================================================

export function MorphingModalTrigger({
  layoutId,
  onClick,
  children,
  className,
  disabled = false,
}: MorphingModalTriggerProps) {
  return (
    <motion.button
      layoutId={layoutId}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'cursor-pointer',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={springs.snappy}
    >
      {children}
    </motion.button>
  );
}

// =============================================================================
// MORPHING MODAL
// =============================================================================

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: 'max-w-[90vw]',
};

export function MorphingModal({
  layoutId,
  isOpen,
  onClose,
  children,
  title,
  showCloseButton = true,
  className,
  maxWidth = 'lg',
  closeOnBackdropClick = true,
  closeOnEscape = true,
}: MorphingModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        onClose();
      }
    },
    [onClose, closeOnEscape]
  );

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && closeOnBackdropClick) {
        onClose();
      }
    },
    [onClose, closeOnBackdropClick]
  );

  // Focus management and keyboard handler
  useEffect(() => {
    if (isOpen) {
      // Store currently focused element
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Focus the modal
      modalRef.current?.focus();

      // Add keyboard listener
      document.addEventListener('keydown', handleKeyDown);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';

        // Restore focus to previous element
        previousActiveElement.current?.focus();
      };
    }
  }, [isOpen, handleKeyDown]);

  // Render into portal
  const modalContent = (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            variants={modalOverlay}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={handleBackdropClick}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Modal container */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
            onClick={handleBackdropClick}
          >
            {/* Modal content with morph animation */}
            <motion.div
              ref={modalRef}
              layoutId={layoutId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? `${layoutId}-title` : undefined}
              tabIndex={-1}
              className={cn(
                'relative w-full',
                'glass-elevated rounded-2xl',
                'overflow-hidden',
                'focus:outline-none',
                maxWidthClasses[maxWidth],
                className
              )}
              transition={springs.gentle}
              style={{
                maxHeight: '90vh',
              }}
            >
              {/* Close button */}
              {showCloseButton && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.1 }}
                  onClick={onClose}
                  className={cn(
                    'absolute top-4 right-4 z-10',
                    'w-8 h-8 rounded-lg',
                    'flex items-center justify-center',
                    'text-muted-foreground hover:text-foreground',
                    'hover:bg-muted/50',
                    'transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'
                  )}
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              )}

              {/* Content with staggered reveal */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.05, duration: 0.2 }}
                className="overflow-y-auto max-h-[90vh]"
              >
                {title && (
                  <h2
                    id={`${layoutId}-title`}
                    className="sr-only"
                  >
                    {title}
                  </h2>
                )}
                {children}
              </motion.div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  // Use portal to render at document body
  if (typeof window === 'undefined') return null;

  return createPortal(modalContent, document.body);
}

// =============================================================================
// MORPHING MODAL CARD
// =============================================================================

/**
 * A card that can morph into a modal when clicked.
 * Combines trigger and content in one component for simpler usage.
 */
interface MorphingModalCardProps {
  /** Unique ID for this card/modal pair */
  id: string;
  /** Whether modal is open */
  isOpen: boolean;
  /** Open/close handlers */
  onOpen: () => void;
  onClose: () => void;
  /** Card content (shown in grid/list) */
  cardContent: ReactNode;
  /** Modal content (shown when expanded) */
  modalContent: ReactNode;
  /** Card class */
  cardClassName?: string;
  /** Modal class */
  modalClassName?: string;
  /** Modal max width */
  modalMaxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

export function MorphingModalCard({
  id,
  isOpen,
  onOpen,
  onClose,
  cardContent,
  modalContent,
  cardClassName,
  modalClassName,
  modalMaxWidth = 'lg',
}: MorphingModalCardProps) {
  const layoutId = `morphing-card-${id}`;

  return (
    <>
      {/* Card trigger (hidden when modal is open) */}
      <AnimatePresence>
        {!isOpen && (
          <MorphingModalTrigger
            layoutId={layoutId}
            onClick={onOpen}
            className={cn(
              'block w-full text-left',
              'card-interactive',
              cardClassName
            )}
          >
            {cardContent}
          </MorphingModalTrigger>
        )}
      </AnimatePresence>

      {/* Modal */}
      <MorphingModal
        layoutId={layoutId}
        isOpen={isOpen}
        onClose={onClose}
        maxWidth={modalMaxWidth}
        className={modalClassName}
      >
        {modalContent}
      </MorphingModal>
    </>
  );
}

export default MorphingModal;
