/**
 * Apple Developer Setup Wizard - Kid-Simple Edition
 *
 * This wizard guides users through Apple Developer account setup with
 * extremely simple, step-by-step instructions that anyone can follow.
 *
 * Why kid-simple?
 * - Publishing to the App Store is intimidating for first-timers
 * - Apple's documentation is dense and technical
 * - Users often give up before they even start
 * - Our goal: Make it feel as easy as signing up for email
 */

export interface WizardStep {
  stepNumber: number;
  title: string;
  description: string;
  instructions: string[];
  tips: string[];
  estimatedTime: string;
  helpUrl?: string;
  image?: string;
  videoUrl?: string;
  inputFields?: WizardInputField[];
  validation?: WizardValidation;
  completed?: boolean;
  skippable?: boolean;
}

export interface WizardInputField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'file' | 'select' | 'checkbox';
  placeholder?: string;
  hint?: string;
  required: boolean;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    errorMessage?: string;
  };
  options?: { value: string; label: string }[];
}

export interface WizardValidation {
  type: 'api_test' | 'file_check' | 'credentials_verify';
  endpoint?: string;
  successMessage: string;
  failureMessage: string;
}

export interface WizardProgress {
  userId: string;
  currentStep: number;
  totalSteps: number;
  completedSteps: number[];
  savedData: Record<string, any>;
  startedAt: Date;
  lastUpdated: Date;
  status: 'in_progress' | 'completed' | 'abandoned';
}

export class AppleDeveloperSetupWizard {
  private steps: WizardStep[];

  constructor() {
    this.steps = this.buildWizardSteps();
  }

  /**
   * Get the complete wizard flow
   */
  getWizard(): WizardStep[] {
    return this.steps;
  }

  /**
   * Get a specific step
   */
  getStep(stepNumber: number): WizardStep | null {
    return this.steps.find((s) => s.stepNumber === stepNumber) || null;
  }

  /**
   * Get total number of steps
   */
  getTotalSteps(): number {
    return this.steps.length;
  }

  /**
   * Get estimated total time
   */
  getEstimatedTotalTime(): string {
    return '25-45 minutes (one-time setup)';
  }

  /**
   * Build the wizard steps - Kid-Simple Edition
   */
  private buildWizardSteps(): WizardStep[] {
    return [
      // =================================================================
      // STEP 1: Create Apple ID (if needed)
      // =================================================================
      {
        stepNumber: 1,
        title: 'Get Your Apple ID Ready',
        description: "You need an Apple ID to publish apps. Don't worry - it's the same ID you use for iCloud or iTunes!",
        instructions: [
          "If you have an iPhone, iPad, or Mac - you already have an Apple ID! It's the email you use to download apps.",
          "Don't have one? Go to appleid.apple.com and click 'Create Your Apple ID'",
          'Use a real email you check often - Apple will send important updates here',
          'Write down your password somewhere safe!',
        ],
        tips: [
          "Use a professional email for business apps (like yourname@company.com)",
          "Enable two-factor authentication - Apple requires it for developers",
          "This Apple ID will be linked to your apps forever, so use one you'll keep",
        ],
        estimatedTime: '2-5 minutes',
        helpUrl: 'https://support.apple.com/apple-id',
        skippable: true,
        inputFields: [
          {
            name: 'appleId',
            label: 'Your Apple ID (email)',
            type: 'text',
            placeholder: 'your.email@example.com',
            hint: 'The email you use for Apple services',
            required: true,
            validation: {
              pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
              errorMessage: 'Please enter a valid email address',
            },
          },
          {
            name: 'hasAppleId',
            label: 'I already have an Apple ID ready to use',
            type: 'checkbox',
            required: false,
          },
        ],
      },

      // =================================================================
      // STEP 2: Enroll in Apple Developer Program
      // =================================================================
      {
        stepNumber: 2,
        title: 'Join the Apple Developer Program',
        description: "This is the $99/year membership that lets you publish apps. Think of it as your 'App Store license'.",
        instructions: [
          'Go to developer.apple.com/programs/enroll',
          'Sign in with your Apple ID from Step 1',
          'Choose whether to enroll as an Individual or Organization:',
          '   - Individual ($99/year): Apps show YOUR name on the App Store',
          '   - Organization ($99/year): Apps show your COMPANY name (requires D-U-N-S number)',
          'Fill out your information and pay with a credit card',
          "Apple will verify your identity - this can take 24-48 hours",
        ],
        tips: [
          'Most solo developers choose "Individual" - it\'s simpler and faster',
          'Organizations need a D-U-N-S number (free from Dun & Bradstreet, takes 1-2 weeks)',
          'Keep your enrollment receipt - it\'s tax deductible for business use!',
          'You can upgrade from Individual to Organization later if needed',
        ],
        estimatedTime: '5-10 minutes (plus 24-48 hours for approval)',
        helpUrl: 'https://developer.apple.com/programs/enroll/',
        inputFields: [
          {
            name: 'enrollmentType',
            label: 'How are you enrolling?',
            type: 'select',
            required: true,
            options: [
              { value: 'individual', label: 'Individual (apps show my personal name)' },
              { value: 'organization', label: 'Organization (apps show my company name)' },
            ],
          },
          {
            name: 'enrollmentConfirmed',
            label: 'I have enrolled and paid the $99 fee',
            type: 'checkbox',
            required: true,
          },
        ],
      },

      // =================================================================
      // STEP 3: Wait for Approval
      // =================================================================
      {
        stepNumber: 3,
        title: 'Wait for Apple to Approve You',
        description: 'Apple manually reviews every developer application. Grab a coffee - this usually takes 24-48 hours.',
        instructions: [
          "Check your email for updates from Apple",
          "You'll get an email saying 'Welcome to the Apple Developer Program' when approved",
          "If Apple needs more info, they'll email you - respond quickly!",
          "Once approved, you can access App Store Connect at appstoreconnect.apple.com",
        ],
        tips: [
          'Check your spam folder if you don\'t hear back',
          'Weekends and holidays may cause delays',
          'If rejected, Apple will tell you why - usually it\'s a simple fix',
          'You can check status at developer.apple.com/account',
        ],
        estimatedTime: '24-48 hours (just waiting)',
        skippable: false,
        inputFields: [
          {
            name: 'approvalReceived',
            label: 'I received the welcome email and can access App Store Connect',
            type: 'checkbox',
            required: true,
          },
        ],
      },

      // =================================================================
      // STEP 4: Create App Store Connect API Key
      // =================================================================
      {
        stepNumber: 4,
        title: 'Create Your API Key',
        description: "This special key lets PlusUltra publish apps on your behalf. It's like giving us a secure keycard to your developer account.",
        instructions: [
          'Go to appstoreconnect.apple.com',
          'Click "Users and Access" at the top',
          'Click "Keys" in the left sidebar',
          'Click "Integrations" tab (or "App Store Connect API")',
          'Click the + button to create a new key',
          'Name it "PlusUltra Publishing" (so you remember what it\'s for)',
          'For Access, select "Admin" (required for publishing)',
          'Click "Generate"',
          'IMPORTANT: Download the .p8 file immediately - you can only download it ONCE!',
        ],
        tips: [
          'Store the .p8 file somewhere safe - you cannot download it again!',
          'The key file is small but very important - treat it like a password',
          'If you lose it, you\'ll need to create a new key',
          'Never share this file with anyone except through secure channels',
        ],
        estimatedTime: '3-5 minutes',
        helpUrl: 'https://developer.apple.com/documentation/appstoreconnectapi/creating_api_keys_for_app_store_connect_api',
        inputFields: [
          {
            name: 'apiKeyFile',
            label: 'Upload your .p8 API Key file',
            type: 'file',
            hint: 'The AuthKey_XXXXXXXX.p8 file you just downloaded',
            required: true,
          },
          {
            name: 'keyId',
            label: 'Key ID',
            type: 'text',
            placeholder: 'XXXXXXXXXX',
            hint: 'Found in the "Keys" page after you create the key',
            required: true,
            validation: {
              pattern: '^[A-Z0-9]{10}$',
              errorMessage: 'Key ID should be 10 alphanumeric characters',
            },
          },
        ],
      },

      // =================================================================
      // STEP 5: Find Your Issuer ID
      // =================================================================
      {
        stepNumber: 5,
        title: 'Copy Your Issuer ID',
        description: "The Issuer ID identifies your team. It's like your team's unique address.",
        instructions: [
          'You should still be on the "Keys" page in App Store Connect',
          'Look for "Issuer ID" at the top of the page',
          "It's a long string of letters, numbers, and dashes (like: 12345678-abcd-1234-abcd-1234567890ab)",
          'Click the copy button next to it, or select and copy it',
          'Paste it below',
        ],
        tips: [
          'The Issuer ID is the same for all API keys in your account',
          'It never changes, so you only need to copy it once',
          "If you can't find it, make sure you're on the Keys page under Users and Access",
        ],
        estimatedTime: '1 minute',
        inputFields: [
          {
            name: 'issuerId',
            label: 'Issuer ID',
            type: 'text',
            placeholder: '12345678-abcd-1234-abcd-1234567890ab',
            hint: 'Found at the top of the Keys page',
            required: true,
            validation: {
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
              errorMessage: 'Issuer ID should be in UUID format',
            },
          },
        ],
      },

      // =================================================================
      // STEP 6: Find Your Team ID
      // =================================================================
      {
        stepNumber: 6,
        title: 'Copy Your Team ID',
        description: 'The Team ID is another identifier Apple uses. Just one more thing to copy!',
        instructions: [
          'Go to developer.apple.com/account',
          'Look in the "Membership Details" section',
          'Find "Team ID" - it\'s a 10-character code like "ABCD1234EF"',
          'Copy it and paste it below',
        ],
        tips: [
          'If you\'re in multiple teams, make sure you select the right one',
          'The Team ID appears in various places - membership page is the easiest',
        ],
        estimatedTime: '1 minute',
        helpUrl: 'https://developer.apple.com/account',
        inputFields: [
          {
            name: 'teamId',
            label: 'Team ID',
            type: 'text',
            placeholder: 'ABCD1234EF',
            hint: '10-character code from your membership page',
            required: true,
            validation: {
              pattern: '^[A-Z0-9]{10}$',
              errorMessage: 'Team ID should be 10 alphanumeric characters',
            },
          },
        ],
      },

      // =================================================================
      // STEP 7: Test Connection
      // =================================================================
      {
        stepNumber: 7,
        title: 'Test Your Connection',
        description: "Let's make sure everything works! We'll try to connect to Apple using your credentials.",
        instructions: [
          'Click the "Test Connection" button below',
          'We\'ll try to access your App Store Connect account',
          'If it works, you\'ll see a green checkmark - you\'re all set!',
          "If it fails, don't worry - we'll help you figure out what's wrong",
        ],
        tips: [
          'Make sure you uploaded the correct .p8 file',
          'Double-check that the Key ID and Issuer ID match what\'s in App Store Connect',
          'If testing fails, the most common issue is a copy/paste error',
        ],
        estimatedTime: '1 minute',
        validation: {
          type: 'api_test',
          endpoint: '/api/v1/publishing/apple/test-connection',
          successMessage: "Connection successful! You're ready to publish apps to the App Store.",
          failureMessage: 'Connection failed. Please check your credentials and try again.',
        },
      },

      // =================================================================
      // STEP 8: Done!
      // =================================================================
      {
        stepNumber: 8,
        title: "You're All Set!",
        description: 'Congratulations! You can now publish apps to the App Store directly from PlusUltra.',
        instructions: [
          'Your Apple Developer credentials are securely stored',
          'You can now use "Publish to App Store" on any of your apps',
          'PlusUltra will handle the technical stuff - builds, screenshots, and submissions',
          "You'll get emails from Apple about your app's review status",
        ],
        tips: [
          'Remember to renew your $99 membership every year',
          'Keep your Apple ID password and 2FA secure',
          'You can update your credentials anytime in Settings > Publishing',
          'First app review usually takes 24-48 hours, sometimes faster!',
        ],
        estimatedTime: "Done!",
        skippable: false,
      },
    ];
  }

  /**
   * Validate a step's input data
   */
  validateStepData(stepNumber: number, data: Record<string, any>): { valid: boolean; errors: string[] } {
    const step = this.getStep(stepNumber);
    if (!step) {
      return { valid: false, errors: ['Step not found'] };
    }

    const errors: string[] = [];

    if (step.inputFields) {
      for (const field of step.inputFields) {
        const value = data[field.name];

        // Check required fields
        if (field.required && !value) {
          errors.push(`${field.label} is required`);
          continue;
        }

        // Check validation patterns
        if (value && field.validation?.pattern) {
          const regex = new RegExp(field.validation.pattern);
          if (!regex.test(value)) {
            errors.push(field.validation.errorMessage || `${field.label} is invalid`);
          }
        }

        // Check length constraints
        if (value && typeof value === 'string') {
          if (field.validation?.minLength && value.length < field.validation.minLength) {
            errors.push(`${field.label} must be at least ${field.validation.minLength} characters`);
          }
          if (field.validation?.maxLength && value.length > field.validation.maxLength) {
            errors.push(`${field.label} must be at most ${field.validation.maxLength} characters`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get a human-readable summary of what credentials are needed
   */
  getCredentialsSummary(): string {
    return `
To publish apps to the Apple App Store, you'll need:

1. Apple ID - Your regular Apple account (free)
2. Apple Developer Program - $99/year membership
3. API Key File (.p8) - A special file you download once
4. Key ID - A 10-character code for your API key
5. Issuer ID - A unique ID for your developer team
6. Team ID - Another 10-character code for your team

Don't worry - this wizard will guide you through getting each one!
The whole process takes about 25-45 minutes, but you only do it once.
    `.trim();
  }

  /**
   * Get quick troubleshooting tips
   */
  getTroubleshootingTips(): Record<string, string[]> {
    return {
      'Connection Failed': [
        'Make sure your Apple Developer membership is active ($99 renewal)',
        'Check that you uploaded the correct .p8 file (not a screenshot or PDF)',
        'Verify the Key ID matches the one shown in App Store Connect',
        'Confirm the Issuer ID is correct (it\'s a long UUID format)',
        'Try creating a new API key if the current one isn\'t working',
      ],
      'Invalid Key File': [
        'The file should end in .p8 and start with -----BEGIN PRIVATE KEY-----',
        'Make sure you downloaded the file, not just took a screenshot',
        'If you lost the file, create a new API key (you can only download once)',
        'Don\'t open the file in a text editor - it may add formatting',
      ],
      'Not Authorized': [
        'Make sure your API key has "Admin" access level',
        'Check that your Apple Developer membership is active',
        'If you\'re in an organization, ask your admin to grant you access',
      ],
      'Enrollment Pending': [
        'Apple manually reviews all developer applications',
        'Wait 24-48 hours for approval (longer on weekends)',
        'Check your email for any requests from Apple',
        'Check your spam folder for Apple emails',
      ],
    };
  }
}

export const appleDeveloperSetupWizard = new AppleDeveloperSetupWizard();
