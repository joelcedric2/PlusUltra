/**
 * Google Play Developer Setup Wizard - Kid-Simple Edition
 *
 * This wizard guides users through Google Play Developer account setup with
 * extremely simple, step-by-step instructions that anyone can follow.
 *
 * Why kid-simple?
 * - Google's developer console can be overwhelming
 * - Service accounts and JSON keys are confusing concepts
 * - Users often get stuck on the verification steps
 * - Our goal: Make it feel as easy as setting up a Gmail account
 */

import type {
  WizardStep,
  WizardInputField,
  WizardValidation,
  WizardProgress,
} from './AppleDeveloperSetupWizard';

export class GooglePlaySetupWizard {
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
    return '20-35 minutes (one-time setup)';
  }

  /**
   * Build the wizard steps - Kid-Simple Edition
   */
  private buildWizardSteps(): WizardStep[] {
    return [
      // =================================================================
      // STEP 1: Create Google Account (if needed)
      // =================================================================
      {
        stepNumber: 1,
        title: 'Get Your Google Account Ready',
        description: "You need a Google account to publish apps. If you use Gmail or YouTube, you already have one!",
        instructions: [
          'If you use Gmail, YouTube, or Google Drive - you already have a Google account!',
          "Don't have one? Go to accounts.google.com and click 'Create account'",
          'Use a business email if publishing company apps',
          'This account will be your developer identity',
        ],
        tips: [
          'Use the same account you want associated with your apps',
          'Consider creating a dedicated account for your company/brand',
          'Enable two-factor authentication for security',
          'You can have multiple developer accounts if needed',
        ],
        estimatedTime: '2-3 minutes',
        helpUrl: 'https://accounts.google.com/signup',
        skippable: true,
        inputFields: [
          {
            name: 'googleEmail',
            label: 'Your Google Account (Gmail)',
            type: 'text',
            placeholder: 'your.email@gmail.com',
            hint: 'The email you want associated with your apps',
            required: true,
            validation: {
              pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
              errorMessage: 'Please enter a valid email address',
            },
          },
          {
            name: 'hasGoogleAccount',
            label: 'I have a Google account ready to use',
            type: 'checkbox',
            required: false,
          },
        ],
      },

      // =================================================================
      // STEP 2: Register for Google Play Developer Account
      // =================================================================
      {
        stepNumber: 2,
        title: 'Join Google Play Developer Program',
        description: "This is the $25 one-time fee that lets you publish apps. Unlike Apple, it's a one-time payment - no yearly renewal!",
        instructions: [
          'Go to play.google.com/console/signup',
          'Sign in with your Google account from Step 1',
          'Fill out your developer profile information:',
          '   - Developer name (shown on Play Store)',
          '   - Contact email and phone',
          '   - Website (optional but recommended)',
          'Pay the $25 registration fee (one-time, not yearly!)',
          'Accept the Developer Distribution Agreement',
        ],
        tips: [
          'The $25 fee is a ONE-TIME payment - no yearly renewal like Apple!',
          'Your developer name is what users see on the Play Store',
          'Use your real info - Google verifies developer identities',
          'You can change your developer name later (with some restrictions)',
        ],
        estimatedTime: '5-10 minutes',
        helpUrl: 'https://play.google.com/console/signup',
        inputFields: [
          {
            name: 'developerName',
            label: 'Developer Name (shown on Play Store)',
            type: 'text',
            placeholder: 'Your Name or Company Name',
            hint: 'This appears under your apps on Google Play',
            required: true,
            validation: {
              minLength: 2,
              maxLength: 50,
              errorMessage: 'Developer name must be 2-50 characters',
            },
          },
          {
            name: 'registrationPaid',
            label: 'I have paid the $25 registration fee',
            type: 'checkbox',
            required: true,
          },
        ],
      },

      // =================================================================
      // STEP 3: Complete Identity Verification
      // =================================================================
      {
        stepNumber: 3,
        title: 'Verify Your Identity',
        description: 'Google requires identity verification for all new developers. This helps keep the Play Store safe.',
        instructions: [
          "After registration, you'll need to verify your identity",
          'Google may ask for:',
          '   - A phone number to receive verification code',
          '   - A government ID (for individuals)',
          '   - Business documents (for organizations)',
          'Follow the prompts in the Play Console',
          'Verification usually takes a few minutes, sometimes up to 48 hours',
        ],
        tips: [
          'Have your phone ready for verification codes',
          'For individuals: a valid ID is usually sufficient',
          'For organizations: you may need business registration documents',
          'If verification is delayed, check your email for additional requests',
          'You can start creating your app while waiting for verification',
        ],
        estimatedTime: '5-10 minutes (may take longer for full verification)',
        inputFields: [
          {
            name: 'verificationComplete',
            label: 'I have completed identity verification (or verification is in progress)',
            type: 'checkbox',
            required: true,
          },
        ],
      },

      // =================================================================
      // STEP 4: Create a Google Cloud Project
      // =================================================================
      {
        stepNumber: 4,
        title: 'Create a Google Cloud Project',
        description: "To automate publishing, we need a 'project' in Google Cloud. Think of it as a container for your app settings.",
        instructions: [
          'Go to console.cloud.google.com',
          'Click the project dropdown at the top (might say "Select a project")',
          'Click "New Project"',
          'Enter a name like "PlusUltra Publishing" (for your reference)',
          'Leave "Organization" as is (or select yours if you have one)',
          'Click "Create"',
          'Wait a few seconds for the project to be created',
          'Make sure your new project is selected (shown in the top bar)',
        ],
        tips: [
          'The project name is just for you - users never see it',
          'One project can be used for all your apps',
          'Google Cloud has a free tier - this setup costs nothing',
          'Write down your Project ID (shown below project name)',
        ],
        estimatedTime: '3-5 minutes',
        helpUrl: 'https://console.cloud.google.com/projectcreate',
        inputFields: [
          {
            name: 'projectId',
            label: 'Google Cloud Project ID',
            type: 'text',
            placeholder: 'plusultra-publishing-123456',
            hint: 'Found in the project settings or URL (the ID, not the name)',
            required: true,
            validation: {
              pattern: '^[a-z][a-z0-9-]{4,28}[a-z0-9]$',
              errorMessage: 'Project ID should be lowercase letters, numbers, and hyphens (6-30 chars)',
            },
          },
        ],
      },

      // =================================================================
      // STEP 5: Enable the Google Play Developer API
      // =================================================================
      {
        stepNumber: 5,
        title: 'Enable the Play Developer API',
        description: "We need to 'turn on' the Play Store API so we can publish apps automatically.",
        instructions: [
          'Make sure your project is selected (from Step 4)',
          'Go to: console.cloud.google.com/apis/library',
          'Search for "Google Play Android Developer API"',
          'Click on it in the results',
          'Click the big blue "Enable" button',
          'Wait for it to activate (takes a few seconds)',
        ],
        tips: [
          'If you see "Manage" instead of "Enable", it\'s already enabled!',
          'This API is free to use',
          'Make sure you\'re enabling it in the correct project',
          'You might also see "Play Integrity API" - that\'s different, ignore it',
        ],
        estimatedTime: '2 minutes',
        helpUrl: 'https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com',
        inputFields: [
          {
            name: 'apiEnabled',
            label: 'I have enabled the Google Play Android Developer API',
            type: 'checkbox',
            required: true,
          },
        ],
      },

      // =================================================================
      // STEP 6: Create a Service Account
      // =================================================================
      {
        stepNumber: 6,
        title: 'Create a Service Account',
        description: "A service account is like a robot assistant that can publish apps on your behalf. We'll create one for PlusUltra.",
        instructions: [
          'Go to: console.cloud.google.com/iam-admin/serviceaccounts',
          'Make sure your project is selected at the top',
          'Click "+ Create Service Account" at the top',
          'Fill in the details:',
          '   - Name: "PlusUltra Publisher" (or any name you like)',
          '   - ID: auto-generates based on name (you can change it)',
          '   - Description: "Automated publishing from PlusUltra"',
          'Click "Create and Continue"',
          'For Role, select "Basic" > "Editor"',
          'Click "Continue", then "Done"',
        ],
        tips: [
          'The service account email will look like: plusultra-publisher@project-id.iam.gserviceaccount.com',
          'Copy this email - you\'ll need it in the next step!',
          'One service account can manage all your apps',
          'You can create additional service accounts if needed',
        ],
        estimatedTime: '3-5 minutes',
        helpUrl: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
        inputFields: [
          {
            name: 'serviceAccountEmail',
            label: 'Service Account Email',
            type: 'text',
            placeholder: 'plusultra-publisher@your-project.iam.gserviceaccount.com',
            hint: 'The email shown after creating the service account',
            required: true,
            validation: {
              pattern: '^[a-z][a-z0-9-]*@[a-z0-9-]+\\.iam\\.gserviceaccount\\.com$',
              errorMessage: 'Service account email should end with .iam.gserviceaccount.com',
            },
          },
        ],
      },

      // =================================================================
      // STEP 7: Download the Service Account Key
      // =================================================================
      {
        stepNumber: 7,
        title: 'Download Your Service Account Key',
        description: "Now we'll create a special key file that lets PlusUltra use your service account. This is a JSON file.",
        instructions: [
          'In the service accounts list, find your new service account',
          'Click the three dots (⋮) on the right side',
          'Click "Manage keys"',
          'Click "Add Key" > "Create new key"',
          'Choose "JSON" format',
          'Click "Create"',
          'A JSON file will download automatically - save it!',
          'IMPORTANT: This file contains sensitive credentials - keep it safe!',
        ],
        tips: [
          'The file will be named something like: project-name-abc123.json',
          'Store this file somewhere secure - treat it like a password!',
          'You can create multiple keys if needed',
          'If you lose the key, you can create a new one (old one still works)',
          'Never commit this file to Git or share it publicly',
        ],
        estimatedTime: '2 minutes',
        inputFields: [
          {
            name: 'serviceAccountKeyFile',
            label: 'Upload your Service Account Key (JSON file)',
            type: 'file',
            hint: 'The .json file you just downloaded',
            required: true,
          },
        ],
      },

      // =================================================================
      // STEP 8: Link Service Account to Play Console
      // =================================================================
      {
        stepNumber: 8,
        title: 'Give Your Service Account Access to Play Console',
        description: "Final step! We need to tell Google Play Console that your service account is allowed to publish apps.",
        instructions: [
          'Go to: play.google.com/console (Play Console)',
          'Click "Users and permissions" in the left sidebar',
          'Click "Invite new users"',
          'Paste your service account email (from Step 6)',
          'Under "App permissions", click "Add app" and select "All apps"',
          'Under "Account permissions", enable these permissions:',
          '   - Release to production, exclude devices, and use Play App Signing',
          '   - Manage testing tracks and edit tester lists',
          '   - Create, edit, and delete draft apps',
          'Click "Invite user"',
          'The invite is automatically accepted for service accounts!',
        ],
        tips: [
          'Service accounts appear as users but with a robot icon',
          'You can adjust permissions for individual apps later',
          '"All apps" permission means it works for future apps too',
          'If you only want partial access, select specific apps instead',
        ],
        estimatedTime: '3-5 minutes',
        helpUrl: 'https://play.google.com/console/users-and-permissions',
        inputFields: [
          {
            name: 'playConsoleLinked',
            label: 'I have added my service account to Play Console with the correct permissions',
            type: 'checkbox',
            required: true,
          },
        ],
      },

      // =================================================================
      // STEP 9: Test Connection
      // =================================================================
      {
        stepNumber: 9,
        title: 'Test Your Connection',
        description: "Let's make sure everything works! We'll try to connect to Google Play using your credentials.",
        instructions: [
          'Click the "Test Connection" button below',
          "We'll try to access your Google Play Console",
          "If it works, you'll see a green checkmark - you're all set!",
          "If it fails, don't worry - we'll help you figure out what's wrong",
        ],
        tips: [
          'Make sure you uploaded the correct JSON key file',
          'Verify the service account email was added to Play Console',
          'Check that you granted the right permissions in Play Console',
          "If it fails, wait 5 minutes and try again - permissions can take time to propagate",
        ],
        estimatedTime: '1 minute',
        validation: {
          type: 'api_test',
          endpoint: '/api/v1/publishing/google/test-connection',
          successMessage: "Connection successful! You're ready to publish apps to Google Play.",
          failureMessage: 'Connection failed. Please check your credentials and permissions.',
        },
      },

      // =================================================================
      // STEP 10: Done!
      // =================================================================
      {
        stepNumber: 10,
        title: "You're All Set!",
        description: 'Congratulations! You can now publish apps to Google Play directly from PlusUltra.',
        instructions: [
          'Your Google Play credentials are securely stored',
          'You can now use "Publish to Google Play" on any of your apps',
          'PlusUltra will handle builds, store listings, and submissions',
          "You'll get emails from Google about your app's review status",
        ],
        tips: [
          'Unlike Apple, there\'s no yearly fee to maintain your account',
          'First app review usually takes a few hours to a few days',
          'Keep your service account key secure',
          'You can update your credentials anytime in Settings > Publishing',
          'Google Play has an open testing track - great for beta releases!',
        ],
        estimatedTime: 'Done!',
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
   * Validate JSON key file structure
   */
  validateKeyFile(keyContent: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const parsed = JSON.parse(keyContent);

      const requiredFields = [
        'type',
        'project_id',
        'private_key_id',
        'private_key',
        'client_email',
        'client_id',
        'auth_uri',
        'token_uri',
      ];

      for (const field of requiredFields) {
        if (!parsed[field]) {
          errors.push(`Missing required field: ${field}`);
        }
      }

      if (parsed.type !== 'service_account') {
        errors.push('Key file must be of type "service_account"');
      }

      if (parsed.private_key && !parsed.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
        errors.push('Private key appears to be malformed');
      }
    } catch (e) {
      errors.push('Invalid JSON format - make sure you uploaded the correct file');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get a human-readable summary of what credentials are needed
   */
  getCredentialsSummary(): string {
    return `
To publish apps to Google Play, you'll need:

1. Google Account - Your regular Google/Gmail account (free)
2. Google Play Developer Account - $25 one-time fee (not yearly!)
3. Google Cloud Project - A container for your settings (free)
4. Service Account Key - A JSON file for automated publishing

Good news: Google's setup is slightly easier than Apple's, and
there's no yearly fee - just the one-time $25 registration!

The whole process takes about 20-35 minutes, but you only do it once.
    `.trim();
  }

  /**
   * Get quick troubleshooting tips
   */
  getTroubleshootingTips(): Record<string, string[]> {
    return {
      'Connection Failed': [
        'Make sure the service account was added to Play Console',
        'Verify you granted the correct permissions (Release, Testing, Draft apps)',
        'Wait 5-10 minutes after adding permissions - they can take time to propagate',
        'Check that you uploaded the correct JSON key file',
        'Verify the Play Developer API is enabled in your Cloud project',
      ],
      'Invalid Key File': [
        'The file should be a .json file downloaded from Google Cloud',
        'Make sure you selected "JSON" format when creating the key',
        'Don\'t modify the file contents - use it as-is',
        'If the file seems corrupted, create a new key in the Cloud Console',
      ],
      'Permission Denied': [
        'The service account needs to be invited to Play Console',
        'Make sure you granted "All apps" or the specific app permissions',
        'Check that you enabled Release, Testing, and Draft app permissions',
        'Service accounts need Editor role in the Cloud project',
      ],
      'API Not Enabled': [
        'Go to Cloud Console > APIs & Services > Library',
        'Search for "Google Play Android Developer API"',
        'Click "Enable" if it\'s not already enabled',
        'Make sure you\'re in the correct project',
      ],
      'Account Not Verified': [
        'Complete identity verification in Play Console',
        'Check your email for verification requests from Google',
        'Verification can take up to 48 hours in some cases',
        'You can create apps while waiting, but cannot publish them',
      ],
    };
  }

  /**
   * Get comparison with Apple setup
   */
  getComparisonWithApple(): {
    advantage: string;
    cost: string;
    time: string;
    difficulty: string;
  } {
    return {
      advantage: 'One-time $25 fee vs Apple\'s $99/year',
      cost: 'Google: $25 once | Apple: $99 every year',
      time: 'Google: ~25 mins | Apple: ~35 mins (plus 24-48h approval wait)',
      difficulty: 'Google: Slightly more steps | Apple: Fewer steps but longer wait',
    };
  }
}

export const googlePlaySetupWizard = new GooglePlaySetupWizard();
