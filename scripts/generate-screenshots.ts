#!/usr/bin/env tsx

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface ScreenshotConfig {
  platform: 'ios' | 'android';
  device: string;
  orientation: 'portrait' | 'landscape';
  locale: string;
  outputDir: string;
}

export interface ScreenshotTest {
  name: string;
  description: string;
  screens: string[];
  actions: string[][];
}

/**
 * Screenshot Generation Script - Automated screenshot capture for app stores
 * Uses emulators/simulators to capture screenshots across different devices and locales
 */
export class ScreenshotGenerator {
  private outputDir: string;
  private platform: 'ios' | 'android';
  private devices: ScreenshotConfig[];

  constructor(platform: 'ios' | 'android' = 'ios', outputDir: string = 'screenshots') {
    this.platform = platform;
    this.outputDir = outputDir;
    this.devices = this.getDefaultDevices();
  }

  /**
   * Generate screenshots for all configured devices and tests
   */
  async generateScreenshots(tests: ScreenshotTest[]): Promise<void> {
    console.log(`📸 Starting screenshot generation for ${this.platform}`);

    try {
      // 1. Setup environment
      await this.setupEnvironment();

      // 2. Create output directory
      await fs.mkdir(this.outputDir, { recursive: true });

      // 3. Generate screenshots for each device and test
      for (const device of this.devices) {
        console.log(`📱 Generating screenshots for ${device.device}`);

        for (const test of tests) {
          await this.generateTestScreenshots(device, test);
        }
      }

      // 4. Optimize screenshots
      await this.optimizeScreenshots();

      console.log(`✅ Screenshot generation completed!`);
      console.log(`📁 Screenshots saved to: ${this.outputDir}`);

    } catch (error) {
      console.error(`❌ Screenshot generation failed:`, error);
      throw error;
    }
  }

  /**
   * Generate screenshots for a specific test on a specific device
   */
  private async generateTestScreenshots(device: ScreenshotConfig, test: ScreenshotTest): Promise<void> {
    console.log(`  🧪 Running test: ${test.name}`);

    try {
      // 1. Launch emulator/simulator
      await this.launchDevice(device);

      // 2. Install and launch app
      await this.installAndLaunchApp(device);

      // 3. Execute test actions and capture screenshots
      for (let i = 0; i < test.screens.length; i++) {
        const screen = test.screens[i];
        const actions = test.actions[i] || [];

        // Execute actions to navigate to screen
        for (const action of actions) {
          await this.executeAction(action, device);
        }

        // Capture screenshot
        const screenshotPath = await this.captureScreenshot(device, test.name, screen);
        console.log(`    📷 Captured: ${screenshotPath}`);
      }

      // 4. Close emulator/simulator
      await this.closeDevice(device);

    } catch (error) {
      console.error(`Failed to generate screenshots for test ${test.name}:`, error);
      // Continue with next test even if one fails
    }
  }

  /**
   * Setup development environment
   */
  private async setupEnvironment(): Promise<void> {
    console.log('🔧 Setting up environment...');

    if (this.platform === 'ios') {
      // Check if Xcode is available
      try {
        await execAsync('xcodebuild -version');
      } catch (error) {
        throw new Error('Xcode is required for iOS screenshot generation');
      }

      // Install dependencies
      await execAsync('brew install imagemagick'); // For image optimization
    } else {
      // Check if Android SDK is available
      try {
        await execAsync('adb version');
      } catch (error) {
        throw new Error('Android SDK is required for Android screenshot generation');
      }

      // Install Android tools
      await execAsync('npm install -g @react-native-community/cli');
    }
  }

  /**
   * Launch device emulator/simulator
   */
  private async launchDevice(device: ScreenshotConfig): Promise<void> {
    console.log(`    🚀 Launching ${device.device}`);

    if (this.platform === 'ios') {
      await execAsync(`xcrun simctl boot "${device.device}"`);
      await execAsync(`xcrun simctl erase "${device.device}"`); // Clean slate
    } else {
      await execAsync(`adb start-server`);
      await execAsync(`emulator -avd "${device.device}"`);
      // Wait for emulator to boot
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  /**
   * Install and launch app on device
   */
  private async installAndLaunchApp(device: ScreenshotConfig): Promise<void> {
    if (this.platform === 'ios') {
      // Build and install iOS app
      await execAsync(`npx react-native run-ios --simulator="${device.device}" --no-packager`);
    } else {
      // Build and install Android app
      await execAsync(`npx react-native run-android --deviceId="${device.device}"`);
    }
  }

  /**
   * Execute test action (navigation, interaction)
   */
  private async executeAction(action: string, device: ScreenshotConfig): Promise<void> {
    // This would integrate with testing framework (e.g., Detox, Appium)
    // For now, we'll use simple delays for navigation
    console.log(`    ⚡ Executing action: ${action}`);

    // Simulate user interactions with delays
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Capture screenshot
   */
  private async captureScreenshot(device: ScreenshotConfig, testName: string, screenName: string): Promise<string> {
    const timestamp = Date.now();
    const filename = `${testName}_${screenName}_${device.device}_${device.orientation}_${timestamp}.png`;
    const filepath = path.join(this.outputDir, filename);

    if (this.platform === 'ios') {
      await execAsync(`xcrun simctl io "${device.device}" screenshot "${filepath}"`);
    } else {
      await execAsync(`adb exec-out screencap -p > "${filepath}"`);
    }

    return filepath;
  }

  /**
   * Close device emulator/simulator
   */
  private async closeDevice(device: ScreenshotConfig): Promise<void> {
    if (this.platform === 'ios') {
      await execAsync(`xcrun simctl shutdown "${device.device}"`);
    } else {
      await execAsync(`adb kill-server`);
    }
  }

  /**
   * Optimize screenshots (resize, compress)
   */
  private async optimizeScreenshots(): Promise<void> {
    console.log('🎨 Optimizing screenshots...');

    try {
      const files = await fs.readdir(this.outputDir);
      const pngFiles = files.filter(file => file.endsWith('.png'));

      for (const file of pngFiles) {
        const filepath = path.join(this.outputDir, file);
        const optimizedPath = path.join(this.outputDir, `optimized_${file}`);

        // Use ImageMagick to optimize
        await execAsync(`convert "${filepath}" -quality 85 -resize 1242x2688\> "${optimizedPath}"`);
        await fs.unlink(filepath); // Remove original
        await fs.rename(optimizedPath, filepath); // Rename optimized version
      }

      console.log(`✅ Optimized ${pngFiles.length} screenshots`);
    } catch (error) {
      console.warn('Screenshot optimization failed, but screenshots were generated:', error);
    }
  }

  /**
   * Get default device configurations
   */
  private getDefaultDevices(): ScreenshotConfig[] {
    if (this.platform === 'ios') {
      return [
        {
          platform: 'ios',
          device: 'iPhone 14 Pro',
          orientation: 'portrait',
          locale: 'en-US',
          outputDir: this.outputDir
        },
        {
          platform: 'ios',
          device: 'iPhone 14 Pro Max',
          orientation: 'portrait',
          locale: 'en-US',
          outputDir: this.outputDir
        },
        {
          platform: 'ios',
          device: 'iPad Pro (11-inch)',
          orientation: 'landscape',
          locale: 'en-US',
          outputDir: this.outputDir
        }
      ];
    } else {
      return [
        {
          platform: 'android',
          device: 'Pixel_7_API_33',
          orientation: 'portrait',
          locale: 'en-US',
          outputDir: this.outputDir
        },
        {
          platform: 'android',
          device: 'Pixel_7_Pro_API_33',
          orientation: 'portrait',
          locale: 'en-US',
          outputDir: this.outputDir
        },
        {
          platform: 'android',
          device: 'Pixel_Fold_API_33',
          orientation: 'landscape',
          locale: 'en-US',
          outputDir: this.outputDir
        }
      ];
    }
  }

  /**
   * Generate sample test scenarios
   */
  getSampleTests(): ScreenshotTest[] {
    return [
      {
        name: 'onboarding',
        description: 'User onboarding flow',
        screens: ['welcome', 'features', 'get-started'],
        actions: [
          ['tap_get_started'],
          ['swipe_features', 'tap_continue'],
          ['tap_signup']
        ]
      },
      {
        name: 'app-creation',
        description: 'Creating a new app',
        screens: ['dashboard', 'new-app', 'app-details', 'generating'],
        actions: [
          ['tap_create_app'],
          ['enter_app_name', 'select_template', 'tap_create'],
          ['wait_for_generation']
        ]
      },
      {
        name: 'collaboration',
        description: 'Collaborative editing',
        screens: ['project', 'editor', 'preview'],
        actions: [
          ['open_project'],
          ['edit_code', 'tap_preview'],
          ['view_collaborators']
        ]
      }
    ];
  }
}

/**
 * CLI interface for screenshot generation
 */
async function main() {
  const args = process.argv.slice(2);
  const platform = (args[0] as 'ios' | 'android') || 'ios';
  const outputDir = args[1] || 'screenshots';

  const generator = new ScreenshotGenerator(platform, outputDir);
  const tests = generator.getSampleTests();

  try {
    await generator.generateScreenshots(tests);
    console.log('🎉 All screenshots generated successfully!');
  } catch (error) {
    console.error('💥 Screenshot generation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export default ScreenshotGenerator;
