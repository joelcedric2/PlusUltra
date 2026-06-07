export interface ProjectTemplate {
  name: string;
  description: string;
  techStack: string[];
  features: string[];
  fileStructure: FileStructure;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface FileStructure {
  [path: string]: string | FileStructure;
}

export interface GeneratedProject {
  projectId: string;
  name: string;
  structure: FileStructure;
  files: Map<string, string>;
  metadata: {
    generatedAt: string;
    techStack: string[];
    features: string[];
    template: string;
  };
}

/**
 * Production-Grade React Native + Expo project template
 */
export const baseReactNativeTemplate: ProjectTemplate = {
  name: 'React Native + Expo Production',
  description: 'Production-ready React Native project with enterprise features, testing, and modern tooling',
  techStack: ['React Native', 'Expo', 'TypeScript', 'Redux Toolkit', 'TanStack Query'],
  features: [
    'TypeScript', 'Redux Toolkit', 'TanStack Query', 'Error Boundaries',
    'Environment Config', 'Analytics', 'Performance Monitoring', 'Testing Suite',
    'ESLint', 'Prettier', 'Expo Router', 'Security Features'
  ],
  dependencies: {
    'expo': '~52.0.0',
    'expo-status-bar': '~2.0.0',
    'react': '18.3.1',
    'react-native': '0.76.1',
    'react-native-screens': '4.1.0',
    'react-native-safe-area-context': '4.12.0',
    '@react-navigation/native': '^6.1.0',
    '@react-navigation/stack': '^6.3.0',
    'react-native-gesture-handler': '~2.20.0',
    'expo-router': '~4.0.0',
    // State Management
    '@reduxjs/toolkit': '^2.0.0',
    'react-redux': '^9.0.0',
    // API & Data Fetching
    '@tanstack/react-query': '^5.17.0',
    // Error Handling & Monitoring
    'react-native-exception-handler': '^2.10.0',
    '@sentry/react-native': '^5.0.0',
    // Analytics
    '@react-native-async-storage/async-storage': '1.23.1',
    'expo-constants': '~16.0.0',
    'expo-device': '~6.0.0',
    'expo-application': '~5.0.0',
    // Utilities
    'lodash': '^4.17.0',
    'date-fns': '^3.0.0',
    'clsx': '^2.0.0',
    'tailwind-merge': '^2.0.0',
    // Security
    'expo-secure-store': '~14.0.0'
  },
  devDependencies: {
    '@babel/core': '^7.25.0',
    '@types/react': '~18.3.12',
    '@types/react-native': '^0.73.0',
    '@types/lodash': '^4.14.0',
    'typescript': '~5.3.0',
    'eslint': '^8.57.0',
    'prettier': '^3.3.0',
    // Testing
    'jest': '^29.7.0',
    'jest-expo': '~52.0.0',
    '@testing-library/react-native': '^12.0.0',
    '@testing-library/jest-native': '^5.0.0',
    'react-test-renderer': '18.3.1',
    // E2E Testing
    'detox': '^20.0.0',
    // Type checking
    '@typescript-eslint/eslint-plugin': '^6.0.0',
    '@typescript-eslint/parser': '^6.0.0',
    // Development tools
    'babel-plugin-module-resolver': '^5.0.0'
  },
  fileStructure: {
    'package.json': 'package_json_template',
    'app.json': 'app_json_template',
    'tsconfig.json': 'tsconfig_json_template',
    'babel.config.js': 'babel_config_template',
    'jest.config.js': 'jest_config_template',
    'detox.config.js': 'detox_config_template',
    '.eslintrc.js': 'eslint_config_template',
    '.prettierrc': 'prettier_config_template',
    'app': {
      '_layout.tsx': 'layout_template',
      'index.tsx': 'index_template',
      '+not-found.tsx': 'not_found_template',
      '(auth)': {
        'login.tsx': 'login_template',
        'register.tsx': 'register_template'
      },
      '(tabs)': {
        '_layout.tsx': 'tabs_layout_template',
        'home.tsx': 'home_template',
        'profile.tsx': 'profile_template'
      }
    },
    'src': {
      'store': {
        'index.ts': 'store_template',
        'slices': {
          'authSlice.ts': 'auth_slice_template',
          'appSlice.ts': 'app_slice_template'
        },
        'hooks.ts': 'store_hooks_template'
      },
      'api': {
        'client.ts': 'api_client_template',
        'queries': {
          'auth.ts': 'auth_queries_template',
          'data.ts': 'data_queries_template'
        }
      },
      'components': {
        'common': {
          'ErrorBoundary.tsx': 'error_boundary_template',
          'LoadingSpinner.tsx': 'loading_spinner_template',
          'Button.tsx': 'button_component_template',
          'Text.tsx': 'text_component_template'
        },
        'layout': {
          'Header.tsx': 'header_template',
          'Footer.tsx': 'footer_template'
        }
      },
      'utils': {
        'constants.ts': 'constants_template',
        'helpers.ts': 'helpers_template',
        'validation.ts': 'validation_template',
        'logger.ts': 'logger_template',
        'analytics.ts': 'analytics_template'
      },
      'types': {
        'api.ts': 'api_types_template',
        'store.ts': 'store_types_template',
        'common.ts': 'common_types_template'
      },
      'config': {
        'environment.ts': 'environment_config_template',
        'app.ts': 'app_config_template'
      }
    },
    'tests': {
      'unit': {
        'components': {
          'Button.test.tsx': 'button_test_template'
        },
        'utils': {
          'helpers.test.ts': 'helpers_test_template'
        }
      },
      'integration': {
        'api.test.ts': 'api_test_template'
      },
      'e2e': {
        'auth.test.ts': 'e2e_auth_test_template'
      }
    },
    '__tests__': {
      'App.test.tsx': 'app_test_template'
    },
    'e2e': {
      '.detoxrc.js': 'detox_e2e_config_template'
    },
    'docs': {
      'README.md': 'readme_template',
      'CONTRIBUTING.md': 'contributing_template',
      'API.md': 'api_docs_template'
    }
  }
};

/**
 * E-commerce app template
 */
export const ecommerceTemplate: ProjectTemplate = {
  ...baseReactNativeTemplate,
  name: 'E-commerce App',
  description: 'Complete e-commerce mobile application with product listings, cart, and checkout',
  techStack: ['React Native', 'Expo', 'TypeScript', 'Supabase', 'Stripe'],
  features: ['Product Catalog', 'Shopping Cart', 'User Authentication', 'Payment Integration', 'Order Management'],
  dependencies: {
    ...baseReactNativeTemplate.dependencies,
    '@supabase/supabase-js': '^2.38.0',
    '@stripe/stripe-react-native': '^0.35.0',
    'expo-secure-store': '~14.0.0'
  }
};

/**
 * Social app template
 */
export const socialTemplate: ProjectTemplate = {
  ...baseReactNativeTemplate,
  name: 'Social Media App',
  description: 'Social media application with posts, comments, and user interactions',
  techStack: ['React Native', 'Expo', 'TypeScript', 'Firebase', 'React Query'],
  features: ['User Profiles', 'Posts & Comments', 'Real-time Chat', 'Image Upload', 'Push Notifications'],
  dependencies: {
    ...baseReactNativeTemplate.dependencies,
    'firebase': '^10.7.0',
    '@tanstack/react-query': '^5.17.0',
    'expo-image-picker': '~16.0.0',
    'expo-notifications': '~0.29.0'
  }
};

/**
 * Productivity app template
 */
export const productivityTemplate: ProjectTemplate = {
  ...baseReactNativeTemplate,
  name: 'Productivity App',
  description: 'Task management and productivity tracking application',
  techStack: ['React Native', 'Expo', 'TypeScript', 'SQLite', 'AsyncStorage'],
  features: ['Task Management', 'Time Tracking', 'Progress Analytics', 'Offline Support', 'Data Export'],
  dependencies: {
    ...baseReactNativeTemplate.dependencies,
    'expo-sqlite': '~15.0.0',
    '@react-native-async-storage/async-storage': '1.23.1',
    'expo-file-system': '~18.0.0',
    'expo-sharing': '~13.0.0'
  }
};

export const availableTemplates = {
  base: baseReactNativeTemplate,
  ecommerce: ecommerceTemplate,
  social: socialTemplate,
  productivity: productivityTemplate
};
