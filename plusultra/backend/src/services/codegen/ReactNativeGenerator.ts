import { availableTemplates, ProjectTemplate, GeneratedProject, FileStructure } from '../../templates/react-native/ProjectTemplates';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface CodeGenerationRequest {
  projectName: string;
  description: string;
  techStack: string[];
  features: string[];
  template: string;
  userId: string;
}

export interface CodeGenerationResult {
  success: boolean;
  project?: GeneratedProject;
  error?: string;
  metadata?: {
    filesGenerated: number;
    templateUsed: string;
    generatedAt: string;
  };
}

export class ReactNativeCodeGenerator {
  private model: BaseChatModel;

  constructor(model: BaseChatModel) {
    this.model = model;
  }

  /**
   * Generate a complete React Native project based on requirements
   */
  async generateProject(request: CodeGenerationRequest): Promise<CodeGenerationResult> {
    try {
      // Select appropriate template
      const template = this.selectTemplate(request);

      // Generate project structure
      const project = await this.generateProjectStructure(template, request);

      // Generate individual files
      const files = await this.generateProjectFiles(project, request);

      const generatedProject: GeneratedProject = {
        projectId: `project-${request.userId}-${Date.now()}`,
        name: request.projectName,
        structure: project.fileStructure,
        files,
        metadata: {
          generatedAt: new Date().toISOString(),
          techStack: request.techStack,
          features: request.features,
          template: request.template
        }
      };

      return {
        success: true,
        project: generatedProject,
        metadata: {
          filesGenerated: files.size,
          templateUsed: request.template,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private selectTemplate(request: CodeGenerationRequest): ProjectTemplate {
    // For now, use the base template
    // In the future, this could use AI to intelligently select the best template
    return availableTemplates.base;
  }

  private async generateProjectStructure(template: ProjectTemplate, request: CodeGenerationRequest): Promise<ProjectTemplate> {
    // Enhance template based on specific requirements
    const enhancedTemplate = { ...template };

    // Add custom features based on description
    if (request.description.toLowerCase().includes('ecommerce') || request.description.toLowerCase().includes('shop')) {
      enhancedTemplate.name = 'E-commerce App';
      enhancedTemplate.dependencies = { ...enhancedTemplate.dependencies, ...availableTemplates.ecommerce.dependencies };
    }

    if (request.description.toLowerCase().includes('social') || request.description.toLowerCase().includes('community')) {
      enhancedTemplate.name = 'Social Media App';
      enhancedTemplate.dependencies = { ...enhancedTemplate.dependencies, ...availableTemplates.social.dependencies };
    }

    return enhancedTemplate;
  }

  private async generateProjectFiles(project: ProjectTemplate, request: CodeGenerationRequest): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    // Generate package.json
    files.set('package.json', this.generatePackageJson(project, request));

    // Generate app.json
    files.set('app.json', this.generateAppJson(request));

    // Generate tsconfig.json
    files.set('tsconfig.json', this.generateTsConfig());

    // Generate babel.config.js
    files.set('babel.config.js', this.generateBabelConfig());

    // Generate app layout
    files.set('app/_layout.tsx', this.generateAppLayout(request));

    // Generate main index page
    files.set('app/index.tsx', this.generateIndexPage(request));

    // Generate not found page
    files.set('app/+not-found.tsx', this.generateNotFoundPage());

    // Generate UI components
    files.set('components/ui/Button.tsx', this.generateButtonComponent());
    files.set('components/ui/Text.tsx', this.generateTextComponent());

    // Generate constants
    files.set('src/utils/constants.ts', this.generateConstantsTemplate());

    // Generate store and slices
    files.set('src/store/index.ts', this.generateStoreTemplate());
    files.set('src/store/slices/authSlice.ts', this.generateAuthSliceTemplate());
    files.set('src/store/slices/appSlice.ts', this.generateAppSliceTemplate());

    // Generate error boundary
    files.set('src/components/common/ErrorBoundary.tsx', this.generateErrorBoundaryTemplate());

    // Generate environment config
    files.set('src/config/environment.ts', this.generateEnvironmentConfigTemplate());

    return files;
  }

  generatePackageJson(template: ProjectTemplate, request: CodeGenerationRequest): string {
    const packageJson = {
      name: request.projectName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      main: 'expo/AppEntry.js',
      scripts: {
        start: 'expo start',
        android: 'expo start --android',
        ios: 'expo start --ios',
        web: 'expo start --web',
        test: 'jest',
        lint: 'eslint . --ext .js,.jsx,.ts,.tsx'
      },
      dependencies: template.dependencies,
      devDependencies: template.devDependencies,
      private: true
    };

    return JSON.stringify(packageJson, null, 2);
  }

  generateAppJson(request: CodeGenerationRequest): string {
    const appJson = {
      expo: {
        name: request.projectName,
        slug: request.projectName.toLowerCase().replace(/\s+/g, '-'),
        version: '1.0.0',
        orientation: 'portrait',
        icon: './assets/icon.png',
        userInterfaceStyle: 'light',
        splash: {
          image: './assets/splash.png',
          resizeMode: 'contain',
          backgroundColor: '#ffffff'
        },
        assetBundlePatterns: [
          '**/*'
        ],
        ios: {
          supportsTablet: true
        },
        android: {
          adaptiveIcon: {
            foregroundImage: './assets/adaptive-icon.png',
            backgroundColor: '#FFFFFF'
          }
        },
        web: {
          favicon: './assets/favicon.png'
        }
      }
    };

    return JSON.stringify(appJson, null, 2);
  }

  generateTsConfig(): string {
    return JSON.stringify({
      extends: 'expo/tsconfig.base',
      compilerOptions: {
        strict: true,
        paths: {
          '@/*': ['./*']
        }
      },
      include: [
        '**/*.ts',
        '**/*.tsx',
        '.expo/types/**/*.ts',
        'expo-env.d.ts'
      ]
    }, null, 2);
  }

  private generateBabelConfig(): string {
    return `module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};`;
  }

  generateAppLayout(request: CodeGenerationRequest): string {
    return `import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: '${request.projectName}' }} />
    </Stack>
  );
}`;
  }

  generateIndexPage(request: CodeGenerationRequest): string {
    const description = request.description;
    const features = request.features.join(', ');

    return `import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to ${request.projectName}!</Text>
      <Text style={styles.description}>
        ${description}
      </Text>
      <Text style={styles.features}>
        Features: ${features}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  features: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
  },
});`;
  }

  private generateNotFoundPage(): string {
    return `import { View, Text, StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <Text style={styles.title}>This screen doesn't exist.</Text>
      <Link href="/" style={styles.link}>
        <Text style={styles.linkText}>Go to home screen!</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: '#2e78b7',
  },
});`;
  }

  generateButtonComponent(): string {
    return `import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        styles[variant],
        disabled && styles.disabled
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.text, styles[\`\${variant}Text\`]]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: '#007AFF',
  },
  secondary: {
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#C6C6C8',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: '#000000',
  },
});`;
  }

  generateTextComponent(): string {
    return `import React from 'react';
import { Text, StyleSheet } from 'react-native';

interface TextProps {
  children: React.ReactNode;
  variant?: 'h1' | 'h2' | 'body' | 'caption';
  style?: any;
}

export const Text: React.FC<TextProps> = ({
  children,
  variant = 'body',
  style
}) => {
  return (
    <Text style={[styles[variant], style]}>
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  h1: {
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 34,
  },
  h2: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  caption: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
});`;
  }

  private generateConstantsTemplate(): string {
    return `export const API_TIMEOUT = 10000;
export const MAX_RETRY_ATTEMPTS = 3;
export const PAGINATION_LIMIT = 20;

export const THEME = {
  colors: {
    primary: '#007AFF',
    secondary: '#5856D6',
    success: '#34C759',
    warning: '#FF9500',
    danger: '#FF3B30',
    light: '#F2F2F7',
    dark: '#1C1C1E',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  typography: {
    sizes: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
      xxl: 24,
      xxxl: 30,
    },
    weights: {
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
};

export const STORAGE_KEYS = {
  AUTH_TOKEN: '@auth_token',
  USER_DATA: '@user_data',
  APP_SETTINGS: '@app_settings',
  THEME: '@theme',
} as const;

export const QUERY_KEYS = {
  USER_PROFILE: 'userProfile',
  USER_LIST: 'userList',
  POSTS: 'posts',
  COMMENTS: 'comments',
} as const;`;
  }

  generateStoreTemplate(): string {
    return `import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from './slices/authSlice';
import { appSlice } from './slices/appSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    app: appSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;`;
  }

  generateAuthSliceTemplate(): string {
    return `import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isLoading: false,
  isAuthenticated: false,
  error: null,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart: (state) => {
      state.isLoading = true;
      state.error = null;
    },
    loginSuccess: (state, action: PayloadAction<{ user: User; token: string }>) => {
      state.isLoading = false;
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.error = null;
    },
    loginFailure: (state, action: PayloadAction<string>) => {
      state.isLoading = false;
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.error = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const { loginStart, loginSuccess, loginFailure, logout, clearError } = authSlice.actions;`;
  }

  private generateAppSliceTemplate(): string {
    return `import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AppState {
  isLoading: boolean;
  theme: 'light' | 'dark';
  language: string;
  notifications: boolean;
}

const initialState: AppState = {
  isLoading: false,
  theme: 'light',
  language: 'en',
  notifications: true,
};

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
    },
    setLanguage: (state, action: PayloadAction<string>) => {
      state.language = action.payload;
    },
    setNotifications: (state, action: PayloadAction<boolean>) => {
      state.notifications = action.payload;
    },
  },
});

export const { setLoading, setTheme, setLanguage, setNotifications } = appSlice.actions;`;
  }

  generateErrorBoundaryTemplate(): string {
    return `import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Sentry from '@sentry/react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    Sentry.captureException(error, {
      contexts: {
        errorInfo: {
          componentStack: errorInfo.componentStack,
        },
      },
    });

    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            We're sorry, but something unexpected happened.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => this.setState({ hasError: false, error: undefined })}
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});`;
  }

  private generateEnvironmentConfigTemplate(): string {
    return `import Constants from 'expo-constants';

interface EnvironmentConfig {
  API_URL: string;
  SENTRY_DSN?: string;
  ANALYTICS_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
}

const ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  development: {
    API_URL: 'http://localhost:3001/api',
    SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
    ANALYTICS_KEY: process.env.EXPO_PUBLIC_ANALYTICS_KEY,
    SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
  staging: {
    API_URL: 'https://staging-api.example.com/api',
    SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
    ANALYTICS_KEY: process.env.EXPO_PUBLIC_ANALYTICS_KEY,
    SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
  production: {
    API_URL: 'https://api.example.com/api',
    SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
    ANALYTICS_KEY: process.env.EXPO_PUBLIC_ANALYTICS_KEY,
    SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
};

const getEnvironment = (): string => {
  const releaseChannel = Constants.expoConfig?.extra?.eas?.env;
  return releaseChannel || 'development';
};

export const env = ENVIRONMENTS[getEnvironment()] || ENVIRONMENTS.development;

export default env;`;
  }
}

// Export singleton instance factory
export const createReactNativeGenerator = (model: BaseChatModel) => {
  return new ReactNativeCodeGenerator(model);
};
