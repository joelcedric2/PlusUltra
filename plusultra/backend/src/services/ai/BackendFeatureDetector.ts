/**
 * Backend Feature Detector
 * Analyzes user intent to detect if backend/database features are needed
 * Suggests appropriate database solutions (Supabase, Firebase, AWS)
 */

export interface BackendRequirement {
  needsBackend: boolean;
  features: string[];
  suggestedDatabases: DatabaseOption[];
  reasoning: string;
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface DatabaseOption {
  name: 'supabase' | 'firebase' | 'aws' | 'custom';
  reason: string;
  features: string[];
  setupDifficulty: 'easy' | 'medium' | 'hard';
  canAutoProvision: boolean;
}

export interface DatabaseSetupGuide {
  database: string;
  steps: SetupStep[];
  estimatedTime: string;
  requiredKeys: string[];
}

export interface SetupStep {
  title: string;
  description: string;
  action?: string;
  code?: string;
  link?: string;
}

/**
 * BackendFeatureDetector Service
 * Intelligently detects when user needs backend features
 */
export class BackendFeatureDetector {
  // Keywords that indicate backend/database needs
  private readonly backendKeywords = {
    auth: ['login', 'signup', 'sign up', 'sign in', 'authentication', 'auth', 'user account', 'register', 'password', 'session'],
    database: ['save', 'store', 'data', 'database', 'persist', 'record', 'collection', 'table', 'query', 'fetch data'],
    realtime: ['realtime', 'real-time', 'live', 'websocket', 'subscription', 'push notification', 'sync', 'collaborative'],
    storage: ['upload', 'file', 'image', 'photo', 'video', 'storage', 'media', 'download', 'attachment'],
    api: ['api', 'endpoint', 'rest', 'graphql', 'backend', 'server', 'cloud function', 'serverless'],
    users: ['user profile', 'user data', 'user list', 'profile', 'followers', 'friends', 'social'],
    payments: ['payment', 'stripe', 'subscription', 'billing', 'checkout', 'purchase', 'buy'],
    notifications: ['notification', 'push', 'email', 'sms', 'alert', 'reminder'],
    analytics: ['analytics', 'tracking', 'metrics', 'stats', 'report', 'dashboard']
  };

  /**
   * Analyze user intent to detect backend requirements
   */
  async analyzeIntent(intent: string, projectName?: string): Promise<BackendRequirement> {
    const lowerIntent = intent.toLowerCase();
    const detectedFeatures: string[] = [];
    const featureScores: Record<string, number> = {};

    // Scan for backend-related keywords
    for (const [feature, keywords] of Object.entries(this.backendKeywords)) {
      const matches = keywords.filter(keyword => lowerIntent.includes(keyword));
      if (matches.length > 0) {
        detectedFeatures.push(feature);
        featureScores[feature] = matches.length;
      }
    }

    const needsBackend = detectedFeatures.length > 0;

    if (!needsBackend) {
      return {
        needsBackend: false,
        features: [],
        suggestedDatabases: [],
        reasoning: 'This appears to be a frontend-only app with no backend requirements.',
        complexity: 'simple'
      };
    }

    // Determine complexity
    const complexity = this.determineComplexity(detectedFeatures, featureScores);

    // Suggest appropriate databases
    const suggestedDatabases = this.suggestDatabases(detectedFeatures, complexity);

    // Generate reasoning
    const reasoning = this.generateReasoning(detectedFeatures, suggestedDatabases);

    return {
      needsBackend,
      features: detectedFeatures,
      suggestedDatabases,
      reasoning,
      complexity
    };
  }

  /**
   * Determine complexity based on detected features
   */
  private determineComplexity(features: string[], scores: Record<string, number>): 'simple' | 'moderate' | 'complex' {
    const totalFeatures = features.length;
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);

    // Complex: Multiple advanced features
    if (features.includes('realtime') && features.includes('api') && totalFeatures > 3) {
      return 'complex';
    }

    // Complex: Payments + multiple features
    if (features.includes('payments') && totalFeatures > 2) {
      return 'complex';
    }

    // Moderate: Auth + database or multiple features
    if ((features.includes('auth') && features.includes('database')) || totalFeatures > 2) {
      return 'moderate';
    }

    // Simple: Just one or two basic features
    return 'simple';
  }

  /**
   * Suggest appropriate databases based on requirements
   */
  private suggestDatabases(features: string[], complexity: string): DatabaseOption[] {
    const suggestions: DatabaseOption[] = [];

    // Supabase - Great for auth, realtime, storage
    if (features.includes('auth') || features.includes('realtime') || features.includes('database')) {
      suggestions.push({
        name: 'supabase',
        reason: 'Best for PostgreSQL database with built-in auth, realtime, and storage. All-in-one solution.',
        features: ['PostgreSQL Database', 'Authentication', 'Real-time Subscriptions', 'File Storage', 'Row Level Security'],
        setupDifficulty: 'easy',
        canAutoProvision: true
      });
    }

    // Firebase - Great for realtime, simple apps
    if (features.includes('realtime') || features.includes('notifications') || complexity === 'simple') {
      suggestions.push({
        name: 'firebase',
        reason: 'Best for real-time apps with NoSQL data. Excellent mobile SDK and push notifications.',
        features: ['Firestore (NoSQL)', 'Authentication', 'Cloud Functions', 'Push Notifications', 'Analytics'],
        setupDifficulty: 'easy',
        canAutoProvision: false
      });
    }

    // AWS - For complex, scalable needs
    if (complexity === 'complex' || features.includes('api') || features.includes('analytics')) {
      suggestions.push({
        name: 'aws',
        reason: 'Best for enterprise-grade, highly scalable applications with full control.',
        features: ['Multiple Database Options', 'Lambda Functions', 'S3 Storage', 'Cognito Auth', 'API Gateway'],
        setupDifficulty: 'hard',
        canAutoProvision: false
      });
    }

    // If no specific match, suggest Supabase as default
    if (suggestions.length === 0) {
      suggestions.push({
        name: 'supabase',
        reason: 'Versatile all-in-one solution suitable for most applications.',
        features: ['PostgreSQL Database', 'Authentication', 'Storage', 'API'],
        setupDifficulty: 'easy',
        canAutoProvision: true
      });
    }

    return suggestions;
  }

  /**
   * Generate human-readable reasoning
   */
  private generateReasoning(features: string[], databases: DatabaseOption[]): string {
    const featureList = features.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join(', ');
    const primaryDb = databases[0];

    return `Your app requires backend features: ${featureList}. We recommend ${primaryDb.name.toUpperCase()} because ${primaryDb.reason}`;
  }

  /**
   * Get setup guide for specific database
   */
  getSetupGuide(database: 'supabase' | 'firebase' | 'aws'): DatabaseSetupGuide {
    switch (database) {
      case 'supabase':
        return this.getSupabaseGuide();
      case 'firebase':
        return this.getFirebaseGuide();
      case 'aws':
        return this.getAWSGuide();
      default:
        return this.getSupabaseGuide();
    }
  }

  /**
   * Supabase setup guide
   */
  private getSupabaseGuide(): DatabaseSetupGuide {
    return {
      database: 'Supabase',
      estimatedTime: '5 minutes',
      requiredKeys: ['Project URL', 'Anon (public) Key', 'Service Role Key (optional)'],
      steps: [
        {
          title: 'Create Supabase Account',
          description: 'Sign up for a free Supabase account',
          link: 'https://supabase.com/dashboard/sign-up',
          action: 'signup'
        },
        {
          title: 'Create New Project',
          description: 'Click "New Project" and choose your organization',
          action: 'create-project'
        },
        {
          title: 'Get Your API Keys',
          description: 'Go to Settings → API. Copy your Project URL and anon key',
          action: 'copy-keys'
        },
        {
          title: 'Paste Keys Here',
          description: 'Paste your Supabase URL and API key in the form below. PlusUltra will test the connection and configure your app automatically.',
          action: 'test-connection'
        },
        {
          title: 'Auto-Setup Complete!',
          description: 'PlusUltra will generate all necessary code, including:\n• Database client configuration\n• Authentication setup\n• API endpoints\n• Type definitions',
          code: `// Auto-generated Supabase client
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)`
        }
      ]
    };
  }

  /**
   * Firebase setup guide
   */
  private getFirebaseGuide(): DatabaseSetupGuide {
    return {
      database: 'Firebase',
      estimatedTime: '7 minutes',
      requiredKeys: ['API Key', 'Auth Domain', 'Project ID', 'App ID'],
      steps: [
        {
          title: 'Create Firebase Project',
          description: 'Go to Firebase Console and create a new project',
          link: 'https://console.firebase.google.com/',
          action: 'signup'
        },
        {
          title: 'Add Web App',
          description: 'Click "Add App" and select Web (</>) platform',
          action: 'add-app'
        },
        {
          title: 'Copy Configuration',
          description: 'Copy the Firebase configuration object from the setup screen',
          action: 'copy-config'
        },
        {
          title: 'Paste Configuration',
          description: 'Paste your Firebase config below. PlusUltra will set up your app.',
          action: 'test-connection'
        },
        {
          title: 'Enable Services',
          description: 'Enable Firestore, Authentication, and Storage in Firebase Console',
          link: 'https://console.firebase.google.com/'
        }
      ]
    };
  }

  /**
   * AWS setup guide
   */
  private getAWSGuide(): DatabaseSetupGuide {
    return {
      database: 'AWS',
      estimatedTime: '15 minutes',
      requiredKeys: ['Access Key ID', 'Secret Access Key', 'Region'],
      steps: [
        {
          title: 'Create AWS Account',
          description: 'Sign up for an AWS account (requires credit card)',
          link: 'https://aws.amazon.com/console/',
          action: 'signup'
        },
        {
          title: 'Create IAM User',
          description: 'Go to IAM → Users → Create User with programmatic access',
          link: 'https://console.aws.amazon.com/iam/'
        },
        {
          title: 'Attach Policies',
          description: 'Attach necessary policies: AmazonDynamoDBFullAccess, AmazonS3FullAccess, AWSLambdaFullAccess',
          action: 'attach-policies'
        },
        {
          title: 'Copy Credentials',
          description: 'Save your Access Key ID and Secret Access Key securely',
          action: 'copy-keys'
        },
        {
          title: 'Configure Services',
          description: 'Choose and configure: DynamoDB/RDS, Lambda, S3, Cognito',
          link: 'https://console.aws.amazon.com/'
        }
      ]
    };
  }

  /**
   * Check if we can auto-provision with given credentials
   */
  async canAutoProvision(database: string, credentials: Record<string, string>): Promise<boolean> {
    switch (database) {
      case 'supabase':
        // Check if we have Management API token for auto-provisioning
        return !!(credentials.SUPABASE_ACCESS_TOKEN && credentials.SUPABASE_ORG_ID);
      case 'firebase':
        // Firebase doesn't support auto-provisioning via API
        return false;
      case 'aws':
        // AWS requires manual setup due to complexity
        return false;
      default:
        return false;
    }
  }
}

export const backendFeatureDetector = new BackendFeatureDetector();
export default backendFeatureDetector;
