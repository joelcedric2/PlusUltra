/**
 * PlusUltra Animation System
 *
 * Luxury Tech aesthetic - sophisticated, fluid, and intentional motion.
 * Built on Framer Motion for React components.
 *
 * Design Philosophy:
 * - Motion should feel like liquid crystal displays
 * - Transitions convey state changes, not just decoration
 * - Spring physics for organic, natural feel
 * - Staggered reveals create hierarchy and flow
 */

import { Variants, Transition, TargetAndTransition } from 'framer-motion';

// =============================================================================
// SPRING PHYSICS PRESETS
// =============================================================================

export const springs = {
  // Snappy - for immediate feedback (buttons, toggles)
  snappy: { type: 'spring', stiffness: 400, damping: 30 } as Transition,

  // Smooth - for most UI transitions
  smooth: { type: 'spring', stiffness: 300, damping: 30 } as Transition,

  // Gentle - for modals and overlays
  gentle: { type: 'spring', stiffness: 200, damping: 25 } as Transition,

  // Bouncy - for celebratory moments
  bouncy: { type: 'spring', stiffness: 400, damping: 15 } as Transition,

  // Molasses - for dramatic, slow reveals
  molasses: { type: 'spring', stiffness: 100, damping: 20 } as Transition,
};

// =============================================================================
// DURATION PRESETS (for non-spring animations)
// =============================================================================

export const durations = {
  instant: 0.1,
  fast: 0.2,
  normal: 0.3,
  slow: 0.5,
  glacial: 0.8,
};

// =============================================================================
// EASING CURVES
// =============================================================================

export const easings = {
  // Smooth deceleration
  easeOut: [0.16, 1, 0.3, 1],

  // Smooth acceleration
  easeIn: [0.4, 0, 1, 1],

  // Symmetric ease
  easeInOut: [0.4, 0, 0.2, 1],

  // Dramatic entrance
  dramatic: [0.68, -0.6, 0.32, 1.6],

  // Subtle overshoot
  overshoot: [0.34, 1.56, 0.64, 1],
};

// =============================================================================
// FADE VARIANTS
// =============================================================================

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: durations.normal, ease: easings.easeOut }
  },
  exit: {
    opacity: 0,
    transition: { duration: durations.fast, ease: easings.easeIn }
  },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springs.smooth
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: durations.fast }
  },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springs.smooth
  },
  exit: {
    opacity: 0,
    y: 10,
    transition: { duration: durations.fast }
  },
};

export const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: springs.smooth
  },
  exit: {
    opacity: 0,
    x: 30,
    transition: { duration: durations.fast }
  },
};

export const fadeInRight: Variants = {
  hidden: { opacity: 0, x: 30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: springs.smooth
  },
  exit: {
    opacity: 0,
    x: -30,
    transition: { duration: durations.fast }
  },
};

// =============================================================================
// SCALE VARIANTS
// =============================================================================

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springs.smooth
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: durations.fast }
  },
};

export const scaleInBouncy: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springs.bouncy
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: { duration: durations.fast }
  },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 25,
    }
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: { duration: durations.fast }
  },
};

// =============================================================================
// STAGGER CONTAINER VARIANTS
// =============================================================================

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
};

export const staggerContainerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

export const staggerContainerSlow: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

// Stagger item (use as child of stagger container)
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: springs.smooth
  },
};

// =============================================================================
// MODAL / OVERLAY VARIANTS
// =============================================================================

export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: durations.normal }
  },
  exit: {
    opacity: 0,
    transition: { duration: durations.fast, delay: 0.1 }
  },
};

export const modalContent: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: springs.gentle
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 10,
    transition: { duration: durations.fast }
  },
};

// Morphing modal (uses shared layoutId for smooth transitions)
export const morphingModal: Variants = {
  hidden: {
    opacity: 0,
    borderRadius: 16,
  },
  visible: {
    opacity: 1,
    borderRadius: 24,
    transition: springs.gentle
  },
  exit: {
    opacity: 0,
    transition: { duration: durations.fast }
  },
};

// =============================================================================
// PAGE TRANSITION VARIANTS
// =============================================================================

export const pageSlideLeft: Variants = {
  hidden: { opacity: 0, x: '100%' },
  visible: {
    opacity: 1,
    x: 0,
    transition: { ...springs.smooth, duration: 0.4 }
  },
  exit: {
    opacity: 0,
    x: '-30%',
    transition: { duration: durations.normal }
  },
};

export const pageSlideRight: Variants = {
  hidden: { opacity: 0, x: '-100%' },
  visible: {
    opacity: 1,
    x: 0,
    transition: { ...springs.smooth, duration: 0.4 }
  },
  exit: {
    opacity: 0,
    x: '30%',
    transition: { duration: durations.normal }
  },
};

export const pageFade: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: durations.normal }
  },
  exit: {
    opacity: 0,
    transition: { duration: durations.fast }
  },
};

// =============================================================================
// INTERACTIVE ELEMENT VARIANTS
// =============================================================================

// Button hover/tap states
export const buttonTap: TargetAndTransition = {
  scale: 0.97,
  transition: { duration: 0.1 },
};

export const buttonHover: TargetAndTransition = {
  scale: 1.02,
  transition: springs.snappy,
};

// Card hover effect with subtle lift
export const cardHover: TargetAndTransition = {
  y: -4,
  boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.3)',
  transition: springs.snappy,
};

// Card with 3D tilt effect
export const card3DTilt = {
  rest: {
    rotateX: 0,
    rotateY: 0,
    scale: 1,
    transition: springs.smooth,
  },
  hover: {
    scale: 1.02,
    transition: springs.snappy,
  },
};

// =============================================================================
// SEGMENTED TOGGLE / TAB VARIANTS
// =============================================================================

export const segmentedIndicator: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: springs.snappy
  },
};

// The indicator pill that slides between options
export const slidingPill = {
  layout: true,
  transition: springs.snappy,
};

// =============================================================================
// LOADING & SKELETON VARIANTS
// =============================================================================

export const shimmer: Variants = {
  hidden: { x: '-100%' },
  visible: {
    x: '100%',
    transition: {
      repeat: Infinity,
      duration: 1.5,
      ease: 'linear',
    },
  },
};

export const pulse: Variants = {
  hidden: { opacity: 0.5 },
  visible: {
    opacity: 1,
    transition: {
      repeat: Infinity,
      repeatType: 'reverse',
      duration: 1,
    },
  },
};

// =============================================================================
// SCROLL-TRIGGERED VARIANTS
// =============================================================================

export const scrollReveal: Variants = {
  hidden: {
    opacity: 0,
    y: 60,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      ...springs.smooth,
      duration: 0.6,
    }
  },
};

export const scrollRevealLeft: Variants = {
  hidden: {
    opacity: 0,
    x: -60,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: springs.smooth
  },
};

export const scrollRevealRight: Variants = {
  hidden: {
    opacity: 0,
    x: 60,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: springs.smooth
  },
};

// =============================================================================
// GLASSMORPHISM ANIMATIONS
// =============================================================================

export const glassReveal: Variants = {
  hidden: {
    opacity: 0,
    backdropFilter: 'blur(0px)',
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    backdropFilter: 'blur(20px)',
    scale: 1,
    transition: {
      opacity: { duration: durations.normal },
      backdropFilter: { duration: durations.slow },
      scale: springs.smooth,
    }
  },
};

// =============================================================================
// NOTIFICATION / TOAST VARIANTS
// =============================================================================

export const toastSlideIn: Variants = {
  hidden: {
    opacity: 0,
    x: 100,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: springs.bouncy
  },
  exit: {
    opacity: 0,
    x: 50,
    scale: 0.95,
    transition: { duration: durations.fast }
  },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Creates a stagger delay based on index
 */
export const staggerDelay = (index: number, baseDelay = 0.1) => ({
  transition: { delay: index * baseDelay },
});

/**
 * Creates custom spring with specific values
 */
export const customSpring = (stiffness: number, damping: number): Transition => ({
  type: 'spring',
  stiffness,
  damping,
});

/**
 * Viewport configuration for scroll animations
 */
export const scrollViewport = {
  once: true,
  margin: '-100px',
  amount: 0.3,
};

/**
 * Combines multiple variants
 */
export const combineVariants = (...variants: Variants[]): Variants => {
  return variants.reduce((acc, variant) => ({
    hidden: { ...acc.hidden, ...variant.hidden },
    visible: { ...acc.visible, ...variant.visible },
    exit: { ...acc.exit, ...variant.exit },
  }), { hidden: {}, visible: {}, exit: {} });
};
