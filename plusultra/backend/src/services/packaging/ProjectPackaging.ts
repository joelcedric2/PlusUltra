import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';

export interface GeneratedProject {
  projectId: string;
  name: string;
  structure: Record<string, any>;
  files: Map<string, string>;
  metadata: {
    generatedAt: string;
    techStack: string[];
    features: string[];
    template: string;
  };
}

export interface PackageOptions {
  format: 'zip' | 'tar';
  includeNodeModules?: boolean;
  includeGit?: boolean;
  compressionLevel?: number;
}

export interface PackageResult {
  success: boolean;
  downloadUrl?: string;
  filePath?: string;
  fileSize?: number;
  error?: string;
  metadata?: {
    filesIncluded: number;
    totalSize: number;
    createdAt: string;
  };
}

export class ProjectPackagingService {
  private outputDir: string;

  constructor(outputDir: string = './generated-projects') {
    this.outputDir = outputDir;
    this.ensureOutputDirectory();
  }

  private ensureOutputDirectory() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Package a generated React Native project into a downloadable archive
   */
  async packageProject(
    project: GeneratedProject,
    options: PackageOptions = { format: 'zip' }
  ): Promise<PackageResult> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${project.name.replace(/\s+/g, '_')}_${timestamp}`;
      const filePath = path.join(this.outputDir, `${fileName}.${options.format}`);

      // Create write stream for the archive
      const output = fs.createWriteStream(filePath);
      const archive = archiver(options.format === 'zip' ? 'zip' : 'tar', {
        zlib: { level: options.compressionLevel || 9 }
      });

      // Handle archive events
      return new Promise((resolve, reject) => {
        output.on('close', () => {
          const stats = fs.statSync(filePath);
          resolve({
            success: true,
            filePath,
            fileSize: stats.size,
            downloadUrl: `/api/v1/download/${fileName}.${options.format}`,
            metadata: {
              filesIncluded: project.files.size,
              totalSize: stats.size,
              createdAt: new Date().toISOString()
            }
          });
        });

        output.on('error', (err: Error) => {
          reject({
            success: false,
            error: `Archive creation failed: ${err.message}`
          });
        });

        archive.on('error', (err: Error) => {
          reject({
            success: false,
            error: `Archive error: ${err.message}`
          });
        });

        // Pipe archive to file
        archive.pipe(output);

        // Add project files to archive
        let filesAdded = 0;
        for (const [filePath, content] of project.files) {
          // Create directory structure if needed
          const dirPath = path.dirname(filePath);
          if (dirPath !== '.') {
            archive.directory(dirPath, dirPath);
          }

          // Add file content
          archive.append(content, { name: filePath });
          filesAdded++;
        }

        // Add package.json if not already included
        if (!project.files.has('package.json')) {
          const packageJson = this.generatePackageJson(project);
          archive.append(packageJson, { name: 'package.json' });
          filesAdded++;
        }

        // Add README.md
        const readme = this.generateReadme(project);
        archive.append(readme, { name: 'README.md' });
        filesAdded++;

        // Add .gitignore
        const gitignore = this.generateGitignore();
        archive.append(gitignore, { name: '.gitignore' });
        filesAdded++;

        // Finalize the archive
        archive.finalize();
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate package.json for the project
   */
  private generatePackageJson(project: GeneratedProject): string {
    const packageJson = {
      name: project.name.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      description: `Generated React Native project: ${project.name}`,
      main: 'App.tsx',
      scripts: {
        start: 'expo start',
        android: 'expo start --android',
        ios: 'expo start --ios',
        web: 'expo start --web',
        test: 'jest',
        lint: 'eslint . --ext .js,.jsx,.ts,.tsx'
      },
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
        'expo-router': '~4.0.0'
      },
      devDependencies: {
        '@babel/core': '^7.25.0',
        '@types/react': '~18.3.12',
        '@types/react-native': '^0.73.0',
        'typescript': '~5.3.0',
        'eslint': '^8.57.0',
        'prettier': '^3.3.0'
      },
      private: true
    };

    return JSON.stringify(packageJson, null, 2);
  }

  /**
   * Generate README.md for the project
   */
  private generateReadme(project: GeneratedProject): string {
    return `# ${project.name}

A React Native mobile application generated by PlusUltra.

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- Expo CLI

### Installation

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start the development server:
   \`\`\`bash
   npm start
   \`\`\`

3. Scan the QR code with Expo Go app on your phone, or run on simulator:
   \`\`\`bash
   npm run ios    # iOS Simulator
   npm run android # Android Emulator
   \`\`\`

## Project Structure

\`\`\`
${project.name}/
├── app/                 # App screens and navigation
├── components/          # Reusable UI components
├── constants/           # App constants and theme
├── package.json         # Project dependencies
└── README.md           # This file
\`\`\`

## Tech Stack

${project.metadata.techStack.join(', ')}

## Features

${project.metadata.features.map((feature: string) => `- ${feature}`).join('\n')}

## Generated

This project was automatically generated on ${project.metadata.generatedAt} using the ${project.metadata.template} template.

---

*Built with ❤️ by PlusUltra*
`;
  }

  /**
   * Generate .gitignore file
   */
  private generateGitignore(): string {
    return `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Expo
.expo/
dist/
web-build/

# Native
*.orig.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision

# Metro
.metro-health-check*

# Debug
*.log

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Temporary files
*.tmp
*.temp

# Build outputs
android/app/build/
ios/build/
`;
  }

  /**
   * List all generated packages
   */
  listPackages(): Array<{ name: string; path: string; size: number; createdAt: Date }> {
    try {
      const files = fs.readdirSync(this.outputDir);
      return files
        .filter(file => file.endsWith('.zip') || file.endsWith('.tar'))
        .map(file => {
          const filePath = path.join(this.outputDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      console.error('Error listing packages:', error);
      return [];
    }
  }

  /**
   * Delete old packages (cleanup)
   */
  cleanupOldPackages(olderThanDays: number = 7): number {
    try {
      const packages = this.listPackages();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      let deletedCount = 0;
      for (const pkg of packages) {
        if (pkg.createdAt < cutoffDate) {
          fs.unlinkSync(pkg.path);
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up packages:', error);
      return 0;
    }
  }

  /**
   * Get package file path for download
   */
  getPackagePath(fileName: string): string | null {
    const filePath = path.join(this.outputDir, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    return null;
  }
}

// Export singleton instance
export const projectPackaging = new ProjectPackagingService();
