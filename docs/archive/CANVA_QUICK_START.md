# Canva Integration - Quick Start Guide

Get up and running with automated app store asset generation in 5 minutes.

## Prerequisites

1. **Canva API Key**: Sign up at [canva.com/developers](https://www.canva.com/developers)
2. **Cloudflare R2 Account**: Create at [cloudflare.com](https://cloudflare.com)
3. **Node.js 18+** and **npm/yarn**

## Step 1: Configure Environment Variables

Copy `.env.example` to `.env` and add your credentials:

```bash
# Required: Canva API
CANVA_API_KEY=your-canva-api-key-here

# Required: Cloudflare R2 (for asset storage)
CLOUDFLARE_R2_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_ACCESS_KEY_ID=your-access-key-id
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-secret-access-key
CLOUDFLARE_R2_BUCKET_NAME=plusultra-app-assets

# Optional: Custom CDN domain
CLOUDFLARE_R2_CDN_DOMAIN=assets.yourdomain.com

# Optional: Canva branding
CANVA_BRAND_ID=your-brand-id-optional
CANVA_DEFAULT_STYLE=modern
```

## Step 2: Install Dependencies

```bash
cd plusultra/backend
npm install

# Required packages (should already be in package.json):
# - node-fetch
# - sharp (for image optimization)
# - @aws-sdk/client-s3 (for R2 storage)
# - @aws-sdk/s3-request-presigner
```

## Step 3: Generate Your First Asset

### Option A: Generate Complete Bundle (Recommended)

```typescript
import AssetManagementService from './services/assets/AssetManagementService';

const assetManager = new AssetManagementService();

// Generate everything for both iOS and Android
const project = await assetManager.generateCompleteAssetBundle({
  projectId: 'my-first-app',
  appName: 'My Amazing App',
  platform: 'both', // or 'ios' or 'android'

  logo: {
    appName: 'My Amazing App',
    style: 'modern',
    colorScheme: ['#007AFF', '#5856D6'],
    platforms: ['both']
  },

  screenshots: {
    ios: {
      appName: 'My Amazing App',
      platform: 'ios',
      screens: [
        {
          title: 'Welcome',
          description: 'Get started in seconds'
        },
        {
          title: 'Powerful Features',
          description: 'Everything you need'
        },
        {
          title: 'Stay Connected',
          description: 'Real-time updates'
        }
      ],
      deviceFrame: true,
      style: 'clean'
    },
    android: {
      appName: 'My Amazing App',
      platform: 'android',
      screens: [
        {
          title: 'Welcome',
          description: 'Get started in seconds'
        },
        {
          title: 'Powerful Features',
          description: 'Everything you need'
        }
      ],
      deviceFrame: true,
      style: 'colorful'
    }
  },

  featureGraphic: {
    appName: 'My Amazing App',
    tagline: 'Build amazing apps in minutes',
    style: 'hero'
  },

  uploadToR2: true // Upload to Cloudflare R2
});

console.log('✅ Assets generated!');
console.log('Logos:', project.assets.logos.length);
console.log('Screenshots:', project.assets.screenshots.length);
console.log('Feature Graphics:', project.assets.featureGraphics.length);

// Get store-ready bundles
const bundles = await assetManager.getStoreReadyBundles(project);
console.log('iOS Bundle ready:', bundles.ios?.isCompliant);
console.log('Android Bundle ready:', bundles.android?.isCompliant);
```

### Option B: Generate Individual Assets

```typescript
import CanvaService from './services/assets/CanvaService';

const canva = new CanvaService();

// Just generate a logo
const logos = await canva.generateLogo({
  appName: 'My App',
  style: 'gradient',
  colorScheme: ['#007AFF'],
  icon: 'abstract',
  platforms: ['ios']
});

console.log('Logo URL:', logos[0].url);
console.log('Dimensions:', logos[0].dimensions);

// Just generate screenshots
const screenshots = await canva.generateScreenshots({
  appName: 'My App',
  platform: 'ios',
  screens: [
    { title: 'Welcome', description: 'Get started' }
  ],
  deviceFrame: true
});

console.log('Screenshot URL:', screenshots[0].url);
```

## Step 4: Use in Store Submission

### iOS App Store

```typescript
import AppStoreAutomationService from './services/store/AppStoreAutomationService';

const appStore = new AppStoreAutomationService();

// Assets are automatically generated during submission
const submission = await appStore.submitToIOS('/path/to/project', {
  platform: 'ios',
  appName: 'My Amazing App',
  bundleId: 'com.mycompany.app',
  version: '1.0.0',
  buildNumber: '1',
  description: 'An amazing productivity app',
  category: 'PRODUCTIVITY'
});

console.log('Submission ID:', submission.submissionId);
console.log('Status:', submission.status);
console.log('Store URL:', submission.storeUrl);
```

### Google Play Store

```typescript
import GooglePlayAutomationService from './services/store/GooglePlayAutomationService';

const playStore = new GooglePlayAutomationService();

// Assets are automatically generated during submission
const submission = await playStore.submitToPlayStore('/path/to/project', {
  packageName: 'com.mycompany.app',
  appName: 'My Amazing App',
  version: '1.0.0',
  versionCode: '1',
  description: 'An amazing productivity app',
  shortDescription: 'Productivity made simple',
  category: 'PRODUCTIVITY'
});

console.log('Submission ID:', submission.submissionId);
console.log('Status:', submission.status);
```

## Step 5: Retrieve and Use Assets

### Get Assets from R2 Storage

```typescript
import AssetStorageIntegration from './services/assets/AssetStorageIntegration';

const storage = new AssetStorageIntegration({
  accountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID!,
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  bucketName: 'plusultra-app-assets'
});

// Get all asset URLs for a project
const urls = await storage.getProjectAssetUrls('my-first-app');

console.log('iOS Logo:', urls.logos.find(l => l.platform === 'ios')?.url);
console.log('iOS Screenshots:', urls.screenshots.filter(s => s.platform === 'ios'));
console.log('Android Feature Graphic:', urls.featureGraphics[0]?.url);

// Get store submission assets (with signed URLs)
const submissionAssets = await storage.getStoreSubmissionAssets(
  'my-first-app',
  'ios'
);

console.log('Assets ready for submission:');
console.log('Logo:', submissionAssets.logo);
console.log('Screenshots:', submissionAssets.screenshots);
```

## Customization Options

### Logo Styles

```typescript
// Modern (default)
style: 'modern'

// Minimal
style: 'minimal'

// Gradient
style: 'gradient'

// Flat
style: 'flat'

// Abstract
style: 'abstract'

// 3D
style: '3d'
```

### Screenshot Styles

```typescript
// Clean (iOS default)
style: 'clean'

// Colorful (Android default)
style: 'colorful'

// Gradient
style: 'gradient'

// Dark
style: 'dark'

// Light
style: 'light'
```

### Color Schemes

```typescript
// iOS blue
colorScheme: ['#007AFF']

// Android green
colorScheme: ['#3DDC84']

// Multi-color gradient
colorScheme: ['#007AFF', '#5856D6', '#FF2D55']

// Custom brand colors
colorScheme: ['#FF6B6B', '#4ECDC4', '#45B7D1']
```

## Common Tasks

### Regenerate Specific Assets

```typescript
// Regenerate just the logo
const newLogos = await assetManager.regenerateAsset(
  project,
  'logo',
  {
    appName: 'My Amazing App',
    style: 'gradient', // Changed style
    colorScheme: ['#FF0000'], // New color
    platforms: ['both']
  }
);

// Regenerate iOS screenshots only
const newScreenshots = await assetManager.regenerateAsset(
  project,
  'screenshot',
  {
    platform: 'ios',
    appName: 'My Amazing App',
    screens: [
      { title: 'New Screen 1', description: 'Updated content' }
    ]
  }
);
```

### Validate Assets

```typescript
// Validate entire project
const validation = await assetManager.validateProjectCompliance(project);

if (validation.isCompliant) {
  console.log('✅ All assets are compliant!');
} else {
  console.error('❌ Compliance issues:');
  console.error('Errors:', validation.errors);
  console.error('Warnings:', validation.warnings);
}

// Check by platform
if (validation.byPlatform.ios?.isValid) {
  console.log('✅ iOS assets ready');
}
if (validation.byPlatform.android?.isValid) {
  console.log('✅ Android assets ready');
}
```

### Storage Management

```typescript
// Get storage stats
const stats = await storage.getProjectStorageStats('my-first-app');
console.log('Files:', stats.totalFiles);
console.log('Size:', Math.round(stats.totalSize / 1024 / 1024), 'MB');
console.log('Breakdown:', stats.breakdown);

// Delete project assets
await storage.deleteProjectAssets('my-first-app');

// Check R2 health
const health = await storage.healthCheck();
if (health.isHealthy) {
  console.log('✅ R2 storage connected');
} else {
  console.error('❌ R2 connection failed:', health.message);
}
```

## Running Tests

```bash
# Set up test environment
export CANVA_API_KEY=your-test-api-key
export CLOUDFLARE_R2_ACCOUNT_ID=your-test-account-id
export CLOUDFLARE_R2_ACCESS_KEY_ID=your-test-access-key
export CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-test-secret
export CLOUDFLARE_R2_BUCKET_NAME=plusultra-test-assets

# Run integration tests
npm test tests/integration/canva-integration.test.ts

# Run specific test
npm test -- --testNamePattern="should generate iOS logo"
```

## Troubleshooting

### "CANVA_API_KEY is required"

```bash
# Check if .env exists
ls -la .env

# Check if key is set
grep CANVA_API_KEY .env

# If missing, add it:
echo "CANVA_API_KEY=your-key-here" >> .env
```

### "R2 upload failed"

```bash
# Verify R2 credentials
node -e "console.log(process.env.CLOUDFLARE_R2_ACCOUNT_ID)"

# Test R2 connection
npm test -- --testNamePattern="should perform R2 health check"
```

### "Canva API error: 401 Unauthorized"

- Check if your API key is valid and not expired
- Verify you're using the correct API key (not the brand ID)
- Try regenerating your API key in Canva dashboard

### "Export timeout - design did not complete in time"

- This is usually temporary - retry the operation
- Canva's servers may be slow during peak hours
- Consider increasing timeout in production:

```typescript
// In CanvaService, increase timeout from 30 to 60 attempts
let attempts = 0;
while (!exportUrl && attempts < 60) { // Changed from 30
  await new Promise(resolve => setTimeout(resolve, 2000));
  // ...
}
```

## Performance Tips

1. **Generate in parallel**:
```typescript
const [iosProject, androidProject] = await Promise.all([
  assetManager.generateCompleteAssetBundle({ platform: 'ios', ... }),
  assetManager.generateCompleteAssetBundle({ platform: 'android', ... })
]);
```

2. **Cache assets**:
```typescript
// Check if already exists
const stats = await storage.getProjectStorageStats('project-id');
if (stats.totalFiles > 0) {
  // Use cached assets
  const urls = await storage.getProjectAssetUrls('project-id');
} else {
  // Generate new
  const project = await assetManager.generateCompleteAssetBundle({...});
}
```

3. **Optimize images**:
```typescript
// AssetManagementService automatically optimizes PNGs with sharp
// To customize:
await sharp(inputPath)
  .png({ compressionLevel: 9, quality: 90 })
  .toFile(outputPath);
```

## Next Steps

1. **Integrate with Frontend**: Create API endpoints for asset generation
2. **Add Caching**: Implement Redis caching for frequently accessed assets
3. **Batch Operations**: Generate assets for multiple apps
4. **Custom Templates**: Create reusable asset templates
5. **A/B Testing**: Test different screenshot variants

## Resources

- **Full Documentation**: `plusultra/backend/src/services/assets/README.md`
- **Integration Summary**: `CANVA_INTEGRATION_SUMMARY.md`
- **API Reference**: See TypeScript interfaces in each service file
- **Example Project**: `plusultra/backend/tests/integration/canva-integration.test.ts`

## Support

- **Issues**: [GitHub Issues](https://github.com/plusultra/backend/issues)
- **Documentation**: [docs.plusultra.dev](https://docs.plusultra.dev)
- **Email**: support@plusultra.dev

---

**🎉 You're ready to generate professional app store assets!**

Start with the "Complete Bundle" example above and customize as needed.
