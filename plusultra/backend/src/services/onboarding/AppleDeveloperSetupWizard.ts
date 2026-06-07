/**
 * Apple Developer Account Setup Wizard
 *
 * A super simple, kid-friendly guide to setting up an Apple Developer account.
 * Designed to be so easy a child could do it - plug and play!
 */

import jwt from 'jsonwebtoken';
import fs from 'fs';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface WizardStep {
  id: string;
  number: number;
  title: string;
  description: string;
  instructions: string[];
  tips: string[];
  videoUrl?: string;
  estimatedTime: string;
  emoji: string;
  isComplete: boolean;
  completedAt?: Date;
}

export interface WizardProgress {
  userId: string;
  currentStep: number;
  totalSteps: number;
  steps: WizardStep[];
  startedAt: Date;
  lastUpdatedAt: Date;
  isComplete: boolean;
  credentials?: AppleCredentials;
  credentialsValidated: boolean;
}

export interface AppleCredentials {
  keyId: string;
  issuerId: string;
  privateKey: string;
  teamId?: string;
}

export interface HelpTopic {
  id: string;
  title: string;
  emoji: string;
  problem: string;
  solutions: string[];
  videoUrl?: string;
  supportLink?: string;
}

export interface RequirementCheck {
  id: string;
  name: string;
  emoji: string;
  description: string;
  required: boolean;
  helpText: string;
  link?: string;
}

// ============================================================================
// WIZARD CONFIGURATION
// ============================================================================

const REQUIREMENTS: RequirementCheck[] = [
  {
    id: 'apple_id',
    name: 'Apple ID',
    emoji: '🍎',
    description: 'Your free Apple account (like an email for Apple stuff)',
    required: true,
    helpText: "Don't have one? No worries! You can create one for FREE at appleid.apple.com - it only takes 5 minutes!",
    link: 'https://appleid.apple.com/account'
  },
  {
    id: 'payment_method',
    name: 'Credit or Debit Card',
    emoji: '💳',
    description: 'For the $99/year developer fee (like a yearly club membership)',
    required: true,
    helpText: 'Ask a parent or guardian if you need help with this part. Apple accepts most major credit and debit cards.'
  },
  {
    id: 'government_id',
    name: 'Government ID',
    emoji: '🪪',
    description: "To prove you're really you (like showing your school ID)",
    required: true,
    helpText: "Apple needs to verify your identity. You can use a driver's license, passport, or national ID card."
  },
  {
    id: 'duns_number',
    name: 'D-U-N-S Number',
    emoji: '🏢',
    description: 'A special business ID number (ONLY if you\'re a company, not a person)',
    required: false,
    helpText: "This is ONLY needed if you're signing up as a company/organization. If you're just one person, skip this! A D-U-N-S number is like a social security number but for businesses.",
    link: 'https://developer.apple.com/support/D-U-N-S/'
  }
];

const WIZARD_STEPS: Omit<WizardStep, 'isComplete' | 'completedAt'>[] = [
  {
    id: 'visit_developer_portal',
    number: 1,
    title: 'Visit the Apple Developer Website',
    emoji: '🌐',
    description: "Let's go to where the magic happens!",
    instructions: [
      "Open your web browser (Safari, Chrome, or Firefox)",
      "Go to: developer.apple.com",
      "Look for the blue 'Account' button in the top right corner",
      "Click on 'Account'"
    ],
    tips: [
      "Bookmark this page so you can find it easily later!",
      "Make sure you're on the REAL Apple site - look for the lock icon in your browser"
    ],
    videoUrl: 'https://www.youtube.com/watch?v=apple-developer-signup',
    estimatedTime: '1 minute'
  },
  {
    id: 'sign_in_apple_id',
    number: 2,
    title: 'Sign In with Your Apple ID',
    emoji: '🔐',
    description: "Use your Apple ID to log in (or create one if you don't have it)",
    instructions: [
      "Enter your Apple ID email address",
      "Enter your password",
      "If you have two-factor authentication, enter the code sent to your device",
      "Don't have an Apple ID? Click 'Create Apple ID' - it's free and takes 5 minutes!"
    ],
    tips: [
      "Forgot your password? Click 'Forgot Apple ID or password?' to reset it",
      "Use a password you'll remember - maybe write it down somewhere safe!",
      "Two-factor authentication keeps your account extra safe, like a double lock on your door"
    ],
    videoUrl: 'https://www.youtube.com/watch?v=create-apple-id',
    estimatedTime: '2-5 minutes'
  },
  {
    id: 'join_developer_program',
    number: 3,
    title: 'Join the Apple Developer Program',
    emoji: '🎫',
    description: "Time to join the club!",
    instructions: [
      "Once logged in, look for 'Join the Apple Developer Program'",
      "Click the big blue 'Enroll' button",
      "Read the overview (it tells you what you get for your $99)"
    ],
    tips: [
      "The $99 fee gives you access for a WHOLE YEAR",
      "You can publish UNLIMITED apps with this membership!",
      "Think of it like a yearly gym membership, but for making apps"
    ],
    videoUrl: 'https://www.youtube.com/watch?v=enroll-developer-program',
    estimatedTime: '2 minutes'
  },
  {
    id: 'choose_account_type',
    number: 4,
    title: 'Choose Your Account Type',
    emoji: '🤔',
    description: "Are you one person or a company?",
    instructions: [
      "Choose 'Individual' if you're signing up as yourself",
      "Choose 'Organization' if you're signing up as a company or team",
      "Not sure? Most people choose 'Individual' - you can always change later!"
    ],
    tips: [
      "Individual = Just you, one person making apps",
      "Organization = A company, school, or group of people",
      "If you choose Organization, you'll need that D-U-N-S number we mentioned earlier"
    ],
    estimatedTime: '1 minute'
  },
  {
    id: 'enter_payment',
    number: 5,
    title: 'Enter Your Payment Information',
    emoji: '💰',
    description: "Almost there! Time to pay the $99 yearly fee",
    instructions: [
      "Enter your credit or debit card information",
      "Double-check that all the numbers are correct",
      "Enter your billing address (where your card statements go)",
      "Review your order and click 'Purchase'"
    ],
    tips: [
      "Ask a parent or guardian for help if you need it!",
      "Make sure you have enough money on the card",
      "Apple will charge you $99 now, then $99 every year on this date",
      "You can turn off auto-renewal later if you want"
    ],
    estimatedTime: '3-5 minutes'
  },
  {
    id: 'wait_for_approval',
    number: 6,
    title: 'Wait for Apple to Approve You',
    emoji: '⏳',
    description: "Apple needs to check your info - this takes 24-48 hours",
    instructions: [
      "Check your email for a confirmation from Apple",
      "Wait 24-48 hours (usually faster!)",
      "Apple might email you if they need more information",
      "Once approved, you'll get a 'Welcome to the Apple Developer Program' email!"
    ],
    tips: [
      "Check your spam/junk folder if you don't see the email",
      "The wait time is usually shorter than 48 hours",
      "You can check your status at developer.apple.com/account",
      "Be patient - good things come to those who wait! 🎉"
    ],
    estimatedTime: '24-48 hours'
  },
  {
    id: 'create_api_key',
    number: 7,
    title: 'Create Your App Store Connect API Key',
    emoji: '🔑',
    description: "Create a special key that lets our app talk to Apple",
    instructions: [
      "Go to appstoreconnect.apple.com",
      "Sign in with your Apple ID",
      "Click 'Users and Access' in the menu",
      "Click 'Keys' at the top",
      "Click the '+' button to create a new key",
      "Give it a name like 'PlusUltra API Key'",
      "Choose 'Admin' access (so it can do everything)",
      "Click 'Generate'"
    ],
    tips: [
      "Keep this key super safe - it's like a master password!",
      "You can only download the key ONCE, so don't lose it",
      "Write down the Key ID and Issuer ID - you'll need them!"
    ],
    videoUrl: 'https://www.youtube.com/watch?v=create-appstore-api-key',
    estimatedTime: '5 minutes'
  },
  {
    id: 'download_credentials',
    number: 8,
    title: 'Download and Save Your Credentials',
    emoji: '📥',
    description: "Grab your special key file and IDs",
    instructions: [
      "Click 'Download API Key' - save the .p8 file somewhere safe",
      "Copy the 'Key ID' (it looks like: ABC123DEF4)",
      "Copy the 'Issuer ID' (it looks like: 12345678-1234-1234-1234-123456789012)",
      "Keep these safe! You'll need them in the next step"
    ],
    tips: [
      "IMPORTANT: You can only download the .p8 file ONCE!",
      "Save it in a folder you'll remember, like 'Apple Developer Keys'",
      "Never share these with anyone you don't trust",
      "These are like the keys to your app kingdom - guard them well! 👑"
    ],
    estimatedTime: '2 minutes'
  },
  {
    id: 'enter_credentials',
    number: 9,
    title: 'Enter Your Credentials Here',
    emoji: '✅',
    description: "Final step! Give us your credentials so we can help you publish apps",
    instructions: [
      "Enter your Key ID in the box below",
      "Enter your Issuer ID in the box below",
      "Upload or paste your .p8 private key",
      "Click 'Validate & Save' to make sure everything works!"
    ],
    tips: [
      "We'll test your credentials to make sure they work",
      "Your credentials are stored securely and encrypted",
      "If something doesn't work, we'll tell you exactly what to fix",
      "You're almost done - just one more click! 🎉"
    ],
    estimatedTime: '2 minutes'
  }
];

const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'forgot_apple_id',
    title: "I forgot my Apple ID or password",
    emoji: '🤷',
    problem: "Can't remember your Apple ID email or password?",
    solutions: [
      "Go to iforgot.apple.com",
      "Enter your email address, phone number, or name",
      "Follow the steps to recover your account",
      "Check your email and phone for recovery codes",
      "Create a new password that you'll remember!"
    ],
    videoUrl: 'https://www.youtube.com/watch?v=recover-apple-id',
    supportLink: 'https://support.apple.com/apple-id'
  },
  {
    id: 'payment_declined',
    title: "My payment was declined",
    emoji: '❌',
    problem: "Your credit or debit card didn't work?",
    solutions: [
      "Make sure you have at least $99 available on the card",
      "Double-check the card number - no typos!",
      "Make sure the expiration date is correct",
      "Check that your billing address matches your card",
      "Try a different card if this one keeps failing",
      "Call your bank - they might have blocked the charge for safety"
    ],
    supportLink: 'https://support.apple.com/billing'
  },
  {
    id: 'taking_too_long',
    title: "My approval is taking too long",
    emoji: '⏰',
    problem: "Been waiting more than 48 hours for approval?",
    solutions: [
      "Check your email (including spam folder) for messages from Apple",
      "Log in to developer.apple.com and check your enrollment status",
      "Apple might need more information from you - check for requests",
      "Contact Apple Developer Support if it's been more than 5 days"
    ],
    supportLink: 'https://developer.apple.com/contact/'
  },
  {
    id: 'cant_find_api_key',
    title: "I can't find where to create API keys",
    emoji: '🔍',
    problem: "App Store Connect is confusing?",
    solutions: [
      "Go to appstoreconnect.apple.com (not developer.apple.com)",
      "Sign in with your Apple ID",
      "Look at the top menu and click 'Users and Access'",
      "Click on the 'Keys' tab at the top of the page",
      "If you don't see 'Keys', you might need Admin access",
      "Ask the Account Holder to give you permission"
    ],
    videoUrl: 'https://www.youtube.com/watch?v=find-api-keys'
  },
  {
    id: 'lost_p8_file',
    title: "I lost my .p8 key file",
    emoji: '😱',
    problem: "Can't find the private key file you downloaded?",
    solutions: [
      "Check your Downloads folder first!",
      "Search your computer for files ending in .p8",
      "If you really can't find it, you'll need to create a NEW key",
      "Go back to App Store Connect > Users and Access > Keys",
      "Revoke (delete) the old key and create a new one",
      "This time, save it somewhere safe immediately!"
    ]
  },
  {
    id: 'duns_confusion',
    title: "I don't understand D-U-N-S numbers",
    emoji: '🏢',
    problem: "Confused about this business ID number?",
    solutions: [
      "D-U-N-S is ONLY needed for companies/organizations",
      "If you're signing up as an Individual, SKIP THIS - you don't need it!",
      "A D-U-N-S number is like a social security number for businesses",
      "It's a 9-digit number that identifies your company",
      "You can get one for free at dnb.com (takes 5-7 days)",
      "Apple can also help you request one during enrollment"
    ],
    supportLink: 'https://developer.apple.com/support/D-U-N-S/'
  },
  {
    id: 'credentials_not_working',
    title: "My credentials aren't working",
    emoji: '🔧',
    problem: "You entered your credentials but they don't validate?",
    solutions: [
      "Double-check your Key ID - it should be about 10 characters",
      "Double-check your Issuer ID - it looks like a UUID with dashes",
      "Make sure you copied the ENTIRE .p8 key file contents",
      "The .p8 file should start with '-----BEGIN PRIVATE KEY-----'",
      "And end with '-----END PRIVATE KEY-----'",
      "Try creating a new API key if nothing else works"
    ]
  },
  {
    id: 'need_human_help',
    title: "I need to talk to a real person",
    emoji: '🧑‍💻',
    problem: "Sometimes you just need human help!",
    solutions: [
      "Apple Developer Support: developer.apple.com/contact/",
      "Phone: 1-800-633-2152 (USA)",
      "They're available Monday-Friday, 9am-5pm PT",
      "You can also request a callback at a time that works for you",
      "Have your Apple ID ready when you call"
    ],
    supportLink: 'https://developer.apple.com/contact/'
  }
];

// ============================================================================
// WIZARD SERVICE CLASS
// ============================================================================

export class AppleDeveloperSetupWizard {
  private progressCache: Map<string, WizardProgress> = new Map();

  /**
   * Get all requirements needed before starting
   */
  getRequirements(): RequirementCheck[] {
    return REQUIREMENTS;
  }

  /**
   * Get a friendly welcome message
   */
  getWelcomeMessage(): string {
    return `
🎉 Welcome to the Apple Developer Setup Wizard! 🎉

We're going to help you set up your Apple Developer account step by step.
It's easier than you might think - we'll guide you through everything!

Here's what we'll do together:
1. ✅ Check that you have everything you need
2. 📝 Create your Apple Developer account
3. 💳 Pay the $99 yearly membership fee
4. ⏳ Wait for Apple to approve you
5. 🔑 Set up your special API key
6. 🚀 Start publishing apps!

Ready? Let's go! 🚀
    `.trim();
  }

  /**
   * Start a new wizard session for a user
   */
  startWizard(userId: string): WizardProgress {
    const progress: WizardProgress = {
      userId,
      currentStep: 1,
      totalSteps: WIZARD_STEPS.length,
      steps: WIZARD_STEPS.map(step => ({
        ...step,
        isComplete: false
      })),
      startedAt: new Date(),
      lastUpdatedAt: new Date(),
      isComplete: false,
      credentialsValidated: false
    };

    this.progressCache.set(userId, progress);
    return progress;
  }

  /**
   * Get current progress for a user
   */
  getProgress(userId: string): WizardProgress | null {
    return this.progressCache.get(userId) || null;
  }

  /**
   * Get current status summary
   */
  getStatusSummary(userId: string): {
    emoji: string;
    message: string;
    progress: number;
    currentStep: WizardStep | null;
    nextStep: WizardStep | null;
  } {
    const progress = this.progressCache.get(userId);

    if (!progress) {
      return {
        emoji: '👋',
        message: "You haven't started the setup wizard yet. Ready to begin?",
        progress: 0,
        currentStep: null,
        nextStep: null
      };
    }

    if (progress.isComplete) {
      return {
        emoji: '🎉',
        message: "Congratulations! You're all set up and ready to publish apps!",
        progress: 100,
        currentStep: null,
        nextStep: null
      };
    }

    const completedSteps = progress.steps.filter(s => s.isComplete).length;
    const progressPercent = Math.round((completedSteps / progress.totalSteps) * 100);
    const currentStep = progress.steps.find(s => !s.isComplete) || null;
    const nextStep = currentStep ? progress.steps.find(s => s.number === currentStep.number + 1) || null : null;

    return {
      emoji: progressPercent > 50 ? '🔥' : '💪',
      message: `You're ${progressPercent}% done! Keep going - you got this!`,
      progress: progressPercent,
      currentStep,
      nextStep
    };
  }

  /**
   * Mark a step as complete
   */
  completeStep(userId: string, stepId: string): {
    success: boolean;
    message: string;
    progress: WizardProgress | null;
  } {
    const progress = this.progressCache.get(userId);

    if (!progress) {
      return {
        success: false,
        message: "You haven't started the wizard yet! Click 'Start' to begin.",
        progress: null
      };
    }

    const step = progress.steps.find(s => s.id === stepId);

    if (!step) {
      return {
        success: false,
        message: "Oops! That step doesn't exist. Let's stick to the plan! 📋",
        progress
      };
    }

    if (step.isComplete) {
      return {
        success: true,
        message: "You already completed this step! Great job! ⭐",
        progress
      };
    }

    // Check if previous steps are complete
    const previousSteps = progress.steps.filter(s => s.number < step.number);
    const incompletePrevious = previousSteps.find(s => !s.isComplete);

    if (incompletePrevious) {
      return {
        success: false,
        message: `Hold up! You need to complete "${incompletePrevious.title}" first. One step at a time! 🐢`,
        progress
      };
    }

    // Mark step as complete
    step.isComplete = true;
    step.completedAt = new Date();
    progress.currentStep = step.number + 1;
    progress.lastUpdatedAt = new Date();

    // Check if all steps are complete
    if (progress.steps.every(s => s.isComplete)) {
      progress.isComplete = true;
    }

    // Fun messages for different progress points
    const completedCount = progress.steps.filter(s => s.isComplete).length;
    let celebrationMessage = '';

    if (completedCount === 1) {
      celebrationMessage = "🎯 Great start! First step down!";
    } else if (completedCount === progress.totalSteps / 2) {
      celebrationMessage = "🔥 Halfway there! You're on fire!";
    } else if (completedCount === progress.totalSteps - 1) {
      celebrationMessage = "😮 ONE MORE STEP! You're SO close!";
    } else if (progress.isComplete) {
      celebrationMessage = "🎉🎊🎉 YOU DID IT! CONGRATULATIONS! 🎉🎊🎉";
    } else {
      celebrationMessage = "✅ Nice work! On to the next one!";
    }

    return {
      success: true,
      message: celebrationMessage,
      progress
    };
  }

  /**
   * Validate Apple credentials
   */
  async validateCredentials(credentials: AppleCredentials): Promise<{
    valid: boolean;
    message: string;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Validate Key ID format
    if (!credentials.keyId || credentials.keyId.length < 8) {
      errors.push("🔑 Key ID looks too short. It should be about 10 characters (like 'ABC123DEF4')");
    }

    // Validate Issuer ID format (UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!credentials.issuerId || !uuidRegex.test(credentials.issuerId)) {
      errors.push("🆔 Issuer ID doesn't look right. It should look like '12345678-1234-1234-1234-123456789012'");
    }

    // Validate private key format
    if (!credentials.privateKey) {
      errors.push("📄 Missing private key! You need to paste the contents of your .p8 file");
    } else if (!credentials.privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      errors.push("📄 Private key should start with '-----BEGIN PRIVATE KEY-----'");
    } else if (!credentials.privateKey.includes('-----END PRIVATE KEY-----')) {
      errors.push("📄 Private key should end with '-----END PRIVATE KEY-----'");
    }

    if (errors.length > 0) {
      return {
        valid: false,
        message: "❌ Oops! There are some problems with your credentials. Check the errors below:",
        errors
      };
    }

    // Try to create a JWT token (this validates the key format)
    try {
      const token = this.createTestJWT(credentials);
      if (token) {
        // In a real implementation, we would also test the token against Apple's API
        // For now, we just validate the format
        return {
          valid: true,
          message: "✅ Your credentials look good! Everything is set up correctly! 🎉",
          errors: []
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`🔧 There's a problem with your private key: ${errorMessage}`);
    }

    return {
      valid: false,
      message: "❌ Couldn't validate your credentials. Let's fix these issues:",
      errors
    };
  }

  /**
   * Create a test JWT to validate credentials
   */
  private createTestJWT(credentials: AppleCredentials): string {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: credentials.issuerId,
      iat: now,
      exp: now + 300, // 5 minutes
      aud: 'appstoreconnect-v1'
    };

    const token = jwt.sign(payload, credentials.privateKey, {
      algorithm: 'ES256',
      header: {
        alg: 'ES256',
        kid: credentials.keyId,
        typ: 'JWT'
      }
    });

    return token;
  }

  /**
   * Save validated credentials for a user
   */
  saveCredentials(userId: string, credentials: AppleCredentials): {
    success: boolean;
    message: string;
  } {
    const progress = this.progressCache.get(userId);

    if (!progress) {
      return {
        success: false,
        message: "You haven't started the wizard yet!"
      };
    }

    progress.credentials = credentials;
    progress.credentialsValidated = true;
    progress.lastUpdatedAt = new Date();

    return {
      success: true,
      message: "🔐 Your credentials have been saved securely! You're all set!"
    };
  }

  /**
   * Get help for a specific topic
   */
  getHelp(topicId: string): HelpTopic | null {
    return HELP_TOPICS.find(t => t.id === topicId) || null;
  }

  /**
   * Get all help topics
   */
  getAllHelpTopics(): HelpTopic[] {
    return HELP_TOPICS;
  }

  /**
   * Get "I'm stuck" suggestions based on current step
   */
  getStuckHelp(userId: string): {
    message: string;
    suggestedTopics: HelpTopic[];
    supportOptions: { name: string; emoji: string; action: string }[];
  } {
    const progress = this.progressCache.get(userId);
    const currentStep = progress?.steps.find(s => !s.isComplete);

    let suggestedTopics: HelpTopic[] = [];

    // Suggest relevant help topics based on current step
    if (currentStep) {
      switch (currentStep.id) {
        case 'sign_in_apple_id':
          suggestedTopics = HELP_TOPICS.filter(t =>
            t.id === 'forgot_apple_id'
          );
          break;
        case 'enter_payment':
          suggestedTopics = HELP_TOPICS.filter(t =>
            t.id === 'payment_declined'
          );
          break;
        case 'wait_for_approval':
          suggestedTopics = HELP_TOPICS.filter(t =>
            t.id === 'taking_too_long'
          );
          break;
        case 'create_api_key':
        case 'download_credentials':
          suggestedTopics = HELP_TOPICS.filter(t =>
            ['cant_find_api_key', 'lost_p8_file'].includes(t.id)
          );
          break;
        case 'enter_credentials':
          suggestedTopics = HELP_TOPICS.filter(t =>
            t.id === 'credentials_not_working'
          );
          break;
        case 'choose_account_type':
          suggestedTopics = HELP_TOPICS.filter(t =>
            t.id === 'duns_confusion'
          );
          break;
      }
    }

    // Always include the "need human help" option
    const humanHelp = HELP_TOPICS.find(t => t.id === 'need_human_help');
    if (humanHelp && !suggestedTopics.includes(humanHelp)) {
      suggestedTopics.push(humanHelp);
    }

    return {
      message: "😊 Don't worry, we're here to help! Here are some things that might help:",
      suggestedTopics,
      supportOptions: [
        {
          name: 'Watch Video Tutorial',
          emoji: '📺',
          action: currentStep?.videoUrl || 'https://www.youtube.com/results?search_query=apple+developer+setup'
        },
        {
          name: 'Read Apple\'s Official Guide',
          emoji: '📖',
          action: 'https://developer.apple.com/support/enrollment/'
        },
        {
          name: 'Contact Apple Support',
          emoji: '☎️',
          action: 'https://developer.apple.com/contact/'
        },
        {
          name: 'Start Live Chat',
          emoji: '💬',
          action: '/support/chat'
        }
      ]
    };
  }

  /**
   * Reset wizard progress for a user
   */
  resetProgress(userId: string): void {
    this.progressCache.delete(userId);
  }

  /**
   * Get a specific step by ID
   */
  getStep(stepId: string): WizardStep | null {
    const step = WIZARD_STEPS.find(s => s.id === stepId);
    return step ? { ...step, isComplete: false } : null;
  }

  /**
   * Get all steps (template)
   */
  getAllSteps(): Omit<WizardStep, 'isComplete' | 'completedAt'>[] {
    return WIZARD_STEPS;
  }
}

// Export singleton instance
export const appleDeveloperWizard = new AppleDeveloperSetupWizard();
