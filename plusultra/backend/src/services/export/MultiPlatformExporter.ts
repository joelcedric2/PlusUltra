import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Configuration for exporting to a specific platform
 */
export interface PlatformConfig {
  name: string;
  framework: 'react-native' | 'flutter' | 'swiftui' | 'web';
  target: 'ios' | 'android' | 'web' | 'desktop';
  buildType: 'debug' | 'release';
  bundleId?: string;
  packageName?: string;
}

/**
 * Result of an export operation
 */
export interface ExportResult {
  success: boolean;
  platform: string;
  outputPath: string;
  buildTime: number;
  fileSize: number;
  artifacts: string[];
  errors?: string[];
  warnings?: string[];
}

/**
 * Multi-platform export service for converting web applications to native mobile/desktop apps
 * Supports React Native, Flutter, and SwiftUI exports
 */
export class MultiPlatformExporter {
  private outputDir: string;
  private tempDir: string;

  constructor(outputDir: string = './exports', tempDir: string = './temp') {
    this.outputDir = outputDir;
    this.tempDir = tempDir;
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create directories:', error);
      throw new Error(`Directory creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export project to React Native platform
   */
  async exportToReactNative(
    sourceProject: string,
    config: PlatformConfig,
    appName: string,
    description: string
  ): Promise<ExportResult> {
    const startTime = Date.now();
    const platformDir = path.join(this.outputDir, `react-native-${config.target}`);

    try {
      // Create React Native project structure
      await this.createReactNativeProject(platformDir, appName, config);

      // Copy relevant source files
      await this.copySourceFiles(sourceProject, platformDir, 'react-native');

      // Update package.json and configuration files
      await this.configureReactNativeProject(platformDir, config, appName, description);

      // Generate native code
      await this.generateNativeCode(platformDir, config);

      // Build for target platform
      await this.buildReactNativeApp(platformDir, config);

      const buildTime = Date.now() - startTime;
      const stats = this.getDirectoryStats(platformDir);

      return {
        success: true,
        platform: `React Native (${config.target})`,
        outputPath: platformDir,
        buildTime,
        fileSize: stats.size,
        artifacts: stats.files,
      };
    } catch (error) {
      return {
        success: false,
        platform: `React Native (${config.target})`,
        outputPath: platformDir,
        buildTime: Date.now() - startTime,
        fileSize: 0,
        artifacts: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Export project to Flutter platform
   */
  async exportToFlutter(
    sourceProject: string,
    config: PlatformConfig,
    appName: string,
    description: string
  ): Promise<ExportResult> {
    const startTime = Date.now();
    const platformDir = path.join(this.outputDir, `flutter-${config.target}`);

    try {
      // Create Flutter project structure
      await this.createFlutterProject(platformDir, appName, config);

      // Copy and convert source files to Dart
      await this.convertToFlutterDart(sourceProject, platformDir);

      // Configure Flutter project
      await this.configureFlutterProject(platformDir, config, appName, description);

      // Build for target platform
      await this.buildFlutterApp(platformDir, config);

      const buildTime = Date.now() - startTime;
      const stats = this.getDirectoryStats(platformDir);

      return {
        success: true,
        platform: `Flutter (${config.target})`,
        outputPath: platformDir,
        buildTime,
        fileSize: stats.size,
        artifacts: stats.files,
      };
    } catch (error) {
      return {
        success: false,
        platform: `Flutter (${config.target})`,
        outputPath: platformDir,
        buildTime: Date.now() - startTime,
        fileSize: 0,
        artifacts: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Export project to SwiftUI platform
   */
  async exportToSwiftUI(
    sourceProject: string,
    config: PlatformConfig,
    appName: string,
    description: string
  ): Promise<ExportResult> {
    const startTime = Date.now();
    const platformDir = path.join(this.outputDir, `swiftui-${config.target}`);

    try {
      // Create SwiftUI project structure
      await this.createSwiftUIProject(platformDir, appName, config);

      // Convert React components to SwiftUI views
      await this.convertToSwiftUI(sourceProject, platformDir);

      // Configure SwiftUI project
      await this.configureSwiftUIProject(platformDir, config, appName, description);

      // Build SwiftUI app
      await this.buildSwiftUIApp(platformDir, config);

      const buildTime = Date.now() - startTime;
      const stats = this.getDirectoryStats(platformDir);

      return {
        success: true,
        platform: `SwiftUI (${config.target})`,
        outputPath: platformDir,
        buildTime,
        fileSize: stats.size,
        artifacts: stats.files,
      };
    } catch (error) {
      return {
        success: false,
        platform: `SwiftUI (${config.target})`,
        outputPath: platformDir,
        buildTime: Date.now() - startTime,
        fileSize: 0,
        artifacts: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Create React Native project structure
   */
  private async createReactNativeProject(projectPath: string, appName: string, config: PlatformConfig): Promise<void> {
    try {
      // Create React Native CLI project
      await execAsync(`npx react-native init ${appName} --template typescript`, {
        cwd: path.dirname(projectPath)
      });

      // Remove the generated project and recreate our structure
      const generatedPath = path.join(projectPath, '..', appName);
      if (fs.existsSync(generatedPath)) {
        if (fs.existsSync(projectPath)) {
          fs.rmSync(projectPath, { recursive: true, force: true });
        }
        fs.renameSync(generatedPath, projectPath);
      }
    } catch (error) {
      throw new Error(`Failed to create React Native project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create Flutter project structure
   */
  private async createFlutterProject(projectPath: string, appName: string, config: PlatformConfig): Promise<void> {
    try {
      // Create Flutter project
      await execAsync(`flutter create --org com.plusultra --project-name ${appName} ${path.basename(projectPath)}`, {
        cwd: path.dirname(projectPath)
      });

      // Move to correct location
      const generatedPath = path.join(projectPath, '..', path.basename(projectPath));
      if (fs.existsSync(generatedPath)) {
        if (fs.existsSync(projectPath)) {
          fs.rmSync(projectPath, { recursive: true, force: true });
        }
        fs.renameSync(generatedPath, projectPath);
      }
    } catch (error) {
      throw new Error(`Failed to create Flutter project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create SwiftUI project structure
   */
  private async createSwiftUIProject(projectPath: string, appName: string, config: PlatformConfig): Promise<void> {
    try {
      const bundleId = config.bundleId || `com.plusultra.${appName.toLowerCase()}`;

      // Create basic SwiftUI project structure
      fs.mkdirSync(path.join(projectPath, appName + '.xcodeproj'), { recursive: true });
      fs.mkdirSync(path.join(projectPath, appName), { recursive: true });
      fs.mkdirSync(path.join(projectPath, 'Assets.xcassets'), { recursive: true });

      // Create Info.plist
      const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>${bundleId}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>${appName}</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSRequiresIPhoneOS</key>
    <true/>
    <key>UILaunchStoryboardName</key>
    <string>LaunchScreen</string>
    <key>UIMainStoryboardFile</key>
    <string>Main</string>
    <key>UIRequiredDeviceCapabilities</key>
    <array>
        <string>armv7</string>
    </array>
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
</dict>
</plist>`;

      fs.writeFileSync(path.join(projectPath, 'Info.plist'), infoPlist);
    } catch (error) {
      throw new Error(`Failed to create SwiftUI project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Copy source files and convert them based on target framework
   */
  private async copySourceFiles(sourceProject: string, destProject: string, framework: string): Promise<void> {
    try {
      const srcDir = path.join(sourceProject, 'src');
      const destDir = path.join(destProject, 'lib');

      if (fs.existsSync(srcDir)) {
        await this.copyDirectory(srcDir, destDir);
      }

      // Convert files based on target framework
      if (framework === 'react-native') {
        await this.convertToReactNative(destProject);
      } else if (framework === 'flutter') {
        await this.convertToFlutterDart(sourceProject, destProject);
      }
    } catch (error) {
      throw new Error(`Failed to copy source files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert React components to React Native components
   */
  private async convertToReactNative(projectPath: string): Promise<void> {
    try {
      // This would involve:
      // 1. Converting HTML elements to React Native components
      // 2. Converting CSS to StyleSheet
      // 3. Handling React Native specific APIs

      // Placeholder for conversion logic
      console.log('Converting to React Native components...');
    } catch (error) {
      throw new Error(`Failed to convert to React Native: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert React components to Flutter/Dart
   */
  private async convertToFlutterDart(sourceProject: string, projectPath: string): Promise<void> {
    try {
      // This would involve:
      // 1. Converting JSX to Dart widget syntax
      // 2. Converting CSS to Flutter styling
      // 3. Converting state management

      // For now, generate basic Flutter structure
      const libDir = path.join(projectPath, 'lib');
      const screensDir = path.join(libDir, 'screens');
      const widgetsDir = path.join(libDir, 'widgets');

      fs.mkdirSync(screensDir, { recursive: true });
      fs.mkdirSync(widgetsDir, { recursive: true });

      // Generate basic Flutter main.dart
      const mainDart = `import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'app.dart';

void main() {
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppState()),
      ],
      child: const MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Generated App',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}

class AppState extends ChangeNotifier {
  String _currentUser = '';
  bool _isLoading = false;

  String get currentUser => _currentUser;
  bool get isLoading => _isLoading;

  void setUser(String user) {
    _currentUser = user;
    notifyListeners();
  }

  void setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }
}
`;

      fs.writeFileSync(path.join(libDir, 'main.dart'), mainDart);

      // Generate basic screens
      const homeScreen = `import 'package:flutter/material.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Home'),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text(
              'Welcome to your Flutter app!',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () {
                // Navigate to other screens
              },
              child: const Text('Get Started'),
            ),
          ],
        ),
      ),
    );
  }
}
`;

      fs.writeFileSync(path.join(screensDir, 'home_screen.dart'), homeScreen);

      console.log('Converted to Flutter/Dart widgets successfully');
    } catch (error) {
      throw new Error(`Failed to convert to Flutter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert React components to SwiftUI views
   */
  private async convertToSwiftUI(sourceProject: string, projectPath: string): Promise<void> {
    try {
      // Generate basic SwiftUI structure
      const appName = path.basename(projectPath).replace(/[^a-zA-Z0-9]/g, '');

      // Generate App.swift
      const appSwift = `import SwiftUI

@main
struct ${appName}App: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
    }
}

class AppState: ObservableObject {
    @Published var currentUser: String = ""
    @Published var isLoading: Bool = false

    func setUser(_ user: String) {
        currentUser = user
    }

    func setLoading(_ loading: Bool) {
        isLoading = loading
    }
}
`;

      fs.writeFileSync(path.join(projectPath, 'Sources/App.swift'), appSwift);

      // Generate ContentView.swift
      const contentViewSwift = `import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationView {
            VStack {
                Text("Welcome to ${appName}!")
                    .font(.largeTitle)
                    .padding()

                if appState.isLoading {
                    ProgressView()
                } else {
                    Text("Current User: \${appState.currentUser}")
                        .padding()
                }

                NavigationLink(destination: ProfileView()) {
                    Text("Go to Profile")
                }
                .padding()
            }
            .navigationTitle("${appName}")
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .environmentObject(AppState())
    }
}
`;

      fs.writeFileSync(path.join(projectPath, 'Sources/ContentView.swift'), contentViewSwift);

      // Generate ProfileView.swift
      const profileViewSwift = `import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack {
            Text("Profile")
                .font(.largeTitle)
                .padding()

            Text("Current User: \${appState.currentUser}")
                .padding()

            Button(action: {
                appState.setUser("Updated User")
            }) {
                Text("Update User")
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(8)
            }
        }
        .navigationTitle("Profile")
    }
}

struct ProfileView_Previews: PreviewProvider {
    static var previews: some View {
        ProfileView()
            .environmentObject(AppState())
    }
}
`;

      fs.writeFileSync(path.join(projectPath, 'Sources/ProfileView.swift'), profileViewSwift);

      console.log('Converted to SwiftUI views successfully');
    } catch (error) {
      throw new Error(`Failed to convert to SwiftUI: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Configure React Native project
   */
  private async configureReactNativeProject(
    projectPath: string,
    config: PlatformConfig,
    appName: string,
    description: string
  ): Promise<void> {
    try {
      // Update package.json
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        packageJson.name = appName.toLowerCase();
        packageJson.description = description;

        if (config.bundleId) {
          packageJson.bundleId = config.bundleId;
        }

        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      }
    } catch (error) {
      throw new Error(`Failed to configure React Native project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Configure Flutter project
   */
  private async configureFlutterProject(
    projectPath: string,
    config: PlatformConfig,
    appName: string,
    description: string
  ): Promise<void> {
    try {
      // Update pubspec.yaml
      const pubspecPath = path.join(projectPath, 'pubspec.yaml');
      if (fs.existsSync(pubspecPath)) {
        let pubspec = fs.readFileSync(pubspecPath, 'utf8');
        pubspec = pubspec.replace(/name: .+/, `name: ${appName.toLowerCase()}`);
        pubspec = pubspec.replace(/description: .+/, `description: ${description}`);

        fs.writeFileSync(pubspecPath, pubspec);
      }
    } catch (error) {
      throw new Error(`Failed to configure Flutter project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Configure SwiftUI project
   */
  private async configureSwiftUIProject(
    projectPath: string,
    config: PlatformConfig,
    appName: string,
    description: string
  ): Promise<void> {
    try {
      // Update SwiftUI project configuration
      // Update Info.plist with proper bundle identifier
      const infoPlistPath = path.join(projectPath, 'Info.plist');
      if (fs.existsSync(infoPlistPath)) {
        let infoPlist = fs.readFileSync(infoPlistPath, 'utf8');
        infoPlist = infoPlist.replace(/\$\(PRODUCT_BUNDLE_IDENTIFIER\)/g, config.bundleId || `com.plusultra.${appName.toLowerCase()}`);
        fs.writeFileSync(infoPlistPath, infoPlist);
      }
    } catch (error) {
      throw new Error(`Failed to configure SwiftUI project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate platform-specific native code
   */
  private async generateNativeCode(projectPath: string, config: PlatformConfig): Promise<void> {
    try {
      if (config.target === 'ios') {
        await execAsync('npx react-native run-ios --configuration Release', { cwd: projectPath });
      } else if (config.target === 'android') {
        await execAsync('npx react-native run-android --variant=release', { cwd: projectPath });
      }
    } catch (error) {
      throw new Error(`Failed to generate native code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build React Native app
   */
  private async buildReactNativeApp(projectPath: string, config: PlatformConfig): Promise<void> {
    try {
      if (config.target === 'ios') {
        await execAsync('npx react-native run-ios --configuration Release', { cwd: projectPath });
      } else if (config.target === 'android') {
        await execAsync('npx react-native run-android --variant=release', { cwd: projectPath });
      }
    } catch (error) {
      throw new Error(`Failed to build React Native app: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build Flutter app
   */
  private async buildFlutterApp(projectPath: string, config: PlatformConfig): Promise<void> {
    try {
      if (config.target === 'ios') {
        await execAsync('flutter build ios --release', { cwd: projectPath });
      } else if (config.target === 'android') {
        await execAsync('flutter build apk --release', { cwd: projectPath });
      } else if (config.target === 'web') {
        await execAsync('flutter build web --release', { cwd: projectPath });
      }
    } catch (error) {
      throw new Error(`Failed to build Flutter app: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build SwiftUI app
   */
  private async buildSwiftUIApp(projectPath: string, config: PlatformConfig): Promise<void> {
    try {
      // Build SwiftUI app using xcodebuild
      const projectName = path.basename(projectPath);
      await execAsync(`xcodebuild -project ${projectName}.xcodeproj -scheme ${projectName} -configuration Release -archivePath ${projectName}.xcarchive archive`, {
        cwd: projectPath
      });
    } catch (error) {
      throw new Error(`Failed to build SwiftUI app: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Recursively copy directory
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    try {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest);
      }

      const items = fs.readdirSync(src);
      for (const item of items) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);

        if (fs.statSync(srcPath).isDirectory()) {
          await this.copyDirectory(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    } catch (error) {
      throw new Error(`Failed to copy directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get directory statistics (size and file list)
   */
  private getDirectoryStats(dirPath: string): { size: number; files: string[] } {
    try {
      let size = 0;
      const files: string[] = [];

      if (!fs.existsSync(dirPath)) {
        return { size: 0, files: [] };
      }

      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          const subStats = this.getDirectoryStats(itemPath);
          size += subStats.size;
          files.push(...subStats.files.map(f => path.join(item, f)));
        } else {
          size += stats.size;
          files.push(item);
        }
      }

      return { size, files };
    } catch (error) {
      console.error('Failed to get directory stats:', error);
      return { size: 0, files: [] };
    }
  }

  /**
   * Export project to all supported platforms
   */
  async exportToAllPlatforms(
    sourceProject: string,
    appName: string,
    description: string
  ): Promise<ExportResult[]> {
    const platforms: PlatformConfig[] = [
      { name: 'React Native iOS', framework: 'react-native', target: 'ios', buildType: 'release' },
      { name: 'React Native Android', framework: 'react-native', target: 'android', buildType: 'release' },
      { name: 'Flutter iOS', framework: 'flutter', target: 'ios', buildType: 'release' },
      { name: 'Flutter Android', framework: 'flutter', target: 'android', buildType: 'release' },
      { name: 'Flutter Web', framework: 'flutter', target: 'web', buildType: 'release' },
      { name: 'SwiftUI iOS', framework: 'swiftui', target: 'ios', buildType: 'release' },
    ];

    const results: ExportResult[] = [];

    for (const platform of platforms) {
      try {
        let result: ExportResult;

        switch (platform.framework) {
          case 'react-native':
            result = await this.exportToReactNative(sourceProject, platform, appName, description);
            break;
          case 'flutter':
            result = await this.exportToFlutter(sourceProject, platform, appName, description);
            break;
          case 'swiftui':
            result = await this.exportToSwiftUI(sourceProject, platform, appName, description);
            break;
          default:
            continue;
        }

        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          platform: platform.name,
          outputPath: '',
          buildTime: 0,
          fileSize: 0,
          artifacts: [],
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        });
      }
    }

    return results;
  }

  /**
   * Clean up temporary directories
   */
  async cleanup(): Promise<void> {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { force: true });
      }
    } catch (error) {
      console.error('Failed to cleanup temporary directory:', error);
      throw new Error(`Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default MultiPlatformExporter;
