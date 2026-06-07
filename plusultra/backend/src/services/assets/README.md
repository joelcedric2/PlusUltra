# Asset Generation Services - Canva Integration

Complete asset generation pipeline for iOS App Store and Google Play Store using Canva's Design API.

## Overview

The asset generation services provide automated creation of professional app store assets:

- **App Icons**: Platform-specific sizes (iOS: 1024x1024, Android: 512x512)
- **Screenshots**: Device-framed screenshots with marketing text
- **Feature Graphics**: Google Play 1024x500 banner graphics
- **Store Compliance**: Automatic validation for App Store and Play Store requirements
- **Cloud Storage**: Seamless integration with Cloudflare R2 for CDN delivery

## Services

### 1. CanvaService

Core service for generating assets using Canva's Design API.

```typescript
import CanvaService from './services/assets/CanvaService';

const canvaService = new CanvaService();

// Generate app logo
const logos = await canvaService.generateLogo({
  appName: 'My Amazing App',
  tagline: 'Build apps faster',
  style: 'modern',
  colorScheme: ['#007AFF', '#5856D6'],
  icon: 'abstract',
  platforms: ['ios', 'android']
});

// Generate screenshots
const screenshots = await canvaService.generateScreenshots({
  appName: 'My Amazing App',
  platform: 'ios',
  screens: [
    {
      title: 'Welcome Screen',
      description: 'Get started in seconds',
      backgroundColor: '#007AFF',
      highlightFeature: true
    },
    {
      title: 'Powerful Features',
      description: 'Everything you need'
    }
  ],
  deviceFrame: true,
  includeText: true,
  style: 'clean'
});

// Generate feature graphic (Android)
const featureGraphic = await canvaService.generateFeatureGraphic({
  appName: 'My Amazing App',
  tagline: 'The best app for productivity',
  backgroundColor: '#3DDC84',
  style: 'hero'
});
```

### 2. AssetManagementService

High-level service for managing complete asset bundles.

```typescript
import AssetManagementService from './services/assets/AssetManagementService';

const assetManager = new AssetManagementService();

// Generate complete asset bundle
const project = await assetManager.generateCompleteAssetBundle({
  projectId: 'project-123',
  appName: 'My Amazing App',
  platform: 'both',

  logo: {
    appName: 'My Amazing App',
    style: 'gradient',
    colorScheme: ['#007AFF', '#3DDC84'],
    platforms: ['both']
  },

  screenshots: {
    ios: {
      appName: 'My Amazing App',
      platform: 'ios',
      screens: [
        { title: 'Welcome', description: 'Get started' },
        { title: 'Features', description: 'Discover more' }
      ],
      deviceFrame: true,
      style: 'clean'
    },
    android: {
      appName: 'My Amazing App',
      platform: 'android',
      screens: [
        { title: 'Welcome', description: 'Get started' },
        { title: 'Features', description: 'Discover more' }
      ],
      deviceFrame: true,
      style: 'colorful'
    }
  },

  featureGraphic: {
    appName: 'My Amazing App',
    tagline: 'Build amazing apps',
    style: 'hero'
  },

  uploadToR2: true,
  r2BucketName: 'my-app-assets'
});

// Get store-ready bundles
const bundles = await assetManager.getStoreReadyBundles(project);

console.log('iOS Bundle:', bundles.ios);
console.log('Android Bundle:', bundles.android);

// Validate compliance
const validation = await assetManager.validateProjectCompliance(project);
if (!validation.isCompliant) {
  console.error('Compliance errors:', validation.errors);
}
```

### 3. AssetStorageIntegration

Manages asset storage in Cloudflare R2 with CDN delivery.

```typescript
import AssetStorageIntegration from './services/assets/AssetStorageIntegration';

const storage = new AssetStorageIntegration({
  accountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID!,
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  bucketName: 'plusultra-app-assets',
  cdnDomain: 'assets.plusultra.dev'
});

// Upload project assets
const uploadedAssets = await storage.uploadProjectAssets(project);

// Get assets for store submission (signed URLs)
const submissionAssets = await storage.getStoreSubmissionAssets(
  'project-123',
  'ios'
);

console.log('Logo URL:', submissionAssets.logo);
console.log('Screenshot URLs:', submissionAssets.screenshots);

// Get storage statistics
const stats = await storage.getProjectStorageStats('project-123');
console.log('Total files:', stats.totalFiles);
console.log('Total size:', stats.totalSize, 'bytes');
```

## Integration with Store Services

### iOS App Store

```typescript
import AppStoreAutomationService from './services/store/AppStoreAutomationService';

const appStore = new AppStoreAutomationService();

// Submit with auto-generated Canva assets
await appStore.submitToIOS(projectPath, {
  platform: 'ios',
  appName: 'My Amazing App',
  bundleId: 'com.mycompany.app',
  version: '1.0.0',
  buildNumber: '1',
  description: 'An amazing productivity app'
});
```

The service will automatically:
1. Generate 1024x1024 app icon using Canva
2. Generate 5-7 screenshots with device frames
3. Create privacy policy and terms of service
4. Validate all assets for App Store compliance
5. Upload to App Store Connect

### Google Play Store

```typescript
import GooglePlayAutomationService from './services/store/GooglePlayAutomationService';

const playStore = new GooglePlayAutomationService();

// Submit with auto-generated Canva assets
await playStore.submitToPlayStore(projectPath, {
  packageName: 'com.mycompany.app',
  appName: 'My Amazing App',
  version: '1.0.0',
  versionCode: '1',
  description: 'An amazing productivity app',
  shortDescription: 'Productivity made simple'
});
```

The service will automatically:
1. Generate 512x512 app icon using Canva
2. Generate phone and tablet screenshots
3. Generate 1024x500 feature graphic using Canva
4. Create privacy policy and terms of service
5. Validate all assets for Play Store compliance
6. Upload to Google Play Console

## Asset Specifications

### iOS App Store

| Asset Type | Dimensions | Format | Max Size | Required |
|------------|-----------|--------|----------|----------|
| App Icon | 1024x1024 | PNG | 20MB | Yes |
| iPhone Screenshots | 1290x2796 (Pro Max)<br>1242x2688 (Standard) | PNG/JPG | 20MB | Yes (min 3) |
| iPad Screenshots | 2048x2732 | PNG/JPG | 20MB | Optional |

### Google Play Store

| Asset Type | Dimensions | Format | Max Size | Required |
|------------|-----------|--------|----------|----------|
| App Icon | 512x512 | PNG (32-bit) | 1MB | Yes |
| Phone Screenshots | 1080x1920<br>1242x2688 | PNG/JPG | 8MB | Yes (min 2) |
| Feature Graphic | 1024x500 | PNG/JPG | 1MB | Recommended |
| Promo Video | - | YouTube URL | - | Optional |

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Canva API
CANVA_API_KEY=your-canva-api-key
CANVA_BRAND_ID=your-brand-id-optional
CANVA_DEFAULT_STYLE=modern
CANVA_DEFAULT_THEME=professional

# Cloudflare R2 Storage
CLOUDFLARE_R2_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_ACCESS_KEY_ID=your-access-key-id
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-secret-access-key
CLOUDFLARE_R2_BUCKET_NAME=plusultra-app-assets
CLOUDFLARE_R2_CDN_DOMAIN=assets.plusultra.dev
```

### Getting Canva API Key

1. Go to [Canva Developers](https://www.canva.com/developers)
2. Create a new app
3. Generate an API key
4. (Optional) Create a brand kit for consistent styling

### Setting Up Cloudflare R2

1. Log in to Cloudflare Dashboard
2. Navigate to R2 Object Storage
3. Create a new bucket (e.g., `plusultra-app-assets`)
4. Generate R2 API tokens:
   - Account ID: Found in R2 dashboard
   - Access Key ID & Secret: From "Manage R2 API Tokens"
5. (Optional) Set up custom domain for CDN:
   - Go to bucket settings
   - Add custom domain (e.g., `assets.plusultra.dev`)
   - Update DNS records as instructed

## Asset Generation Best Practices

### 1. Logo Design

```typescript
// ✅ Good: Clear, simple, recognizable
const logo = await canvaService.generateLogo({
  appName: 'TaskFlow',
  style: 'minimal',
  colorScheme: ['#007AFF', '#FFFFFF'],
  icon: 'abstract'
});

// ❌ Avoid: Too much text, complex gradients
const badLogo = await canvaService.generateLogo({
  appName: 'TaskFlow - The Ultimate Task Management...',
  style: '3d',
  colorScheme: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00']
});
```

### 2. Screenshots

```typescript
// ✅ Good: Clear hierarchy, benefit-focused
const screenshots = await canvaService.generateScreenshots({
  appName: 'TaskFlow',
  platform: 'ios',
  screens: [
    {
      title: 'Stay Organized',
      description: 'Never miss a deadline',
      highlightFeature: true
    },
    {
      title: 'Collaborate',
      description: 'Work together in real-time'
    }
  ],
  deviceFrame: true,
  style: 'clean'
});

// ❌ Avoid: Generic titles, no clear benefit
const badScreenshots = await canvaService.generateScreenshots({
  screens: [
    { title: 'Screen 1', description: 'This is the app' },
    { title: 'Screen 2', description: 'Another screen' }
  ]
});
```

### 3. Feature Graphic (Android)

```typescript
// ✅ Good: Clear value proposition, branded
const featureGraphic = await canvaService.generateFeatureGraphic({
  appName: 'TaskFlow',
  tagline: 'Get more done, stress less',
  backgroundColor: '#007AFF',
  style: 'hero'
});

// ❌ Avoid: Cluttered, multiple messages
const badFeatureGraphic = await canvaService.generateFeatureGraphic({
  appName: 'TaskFlow',
  tagline: 'Task management, notes, calendar, reminders, and more!',
  style: 'feature-showcase'
});
```

## Compliance Validation

All generated assets are automatically validated for store compliance:

```typescript
const validation = await canvaService.validateAsset(logo);

if (!validation.isValid) {
  console.error('Errors:', validation.errors);
  // Example errors:
  // - "iOS app icon must be exactly 1024x1024 pixels"
  // - "Asset exceeds 20MB limit"
  // - "Feature graphic must be exactly 1024x500 pixels"
}

if (validation.warnings.length > 0) {
  console.warn('Warnings:', validation.warnings);
  // Example warnings:
  // - "iOS App Store recommends at least 3 screenshots"
  // - "Feature graphic is recommended for better visibility"
}
```

## Error Handling

```typescript
try {
  const logos = await canvaService.generateLogo({
    appName: 'My App',
    platforms: ['ios']
  });
} catch (error) {
  if (error.message.includes('Canva API error')) {
    // Handle Canva API errors (rate limits, auth issues)
    console.error('Canva API error:', error);
  } else if (error.message.includes('Invalid asset size')) {
    // Handle validation errors
    console.error('Asset validation failed:', error);
  } else {
    // Handle other errors
    console.error('Unexpected error:', error);
  }
}
```

## Testing

Run integration tests:

```bash
# Set up test environment variables
export CANVA_API_KEY=your-test-api-key
export CLOUDFLARE_R2_ACCOUNT_ID=your-test-account-id
export CLOUDFLARE_R2_ACCESS_KEY_ID=your-test-access-key
export CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-test-secret
export CLOUDFLARE_R2_BUCKET_NAME=plusultra-test-assets

# Run tests
npm test tests/integration/canva-integration.test.ts
```

## Performance Considerations

### Asset Generation Time

- **Logo**: ~10-15 seconds per platform
- **Screenshots**: ~20-30 seconds per screen
- **Feature Graphic**: ~10-15 seconds
- **Complete Bundle**: ~2-3 minutes for both platforms

### Optimization

```typescript
// Generate assets for both platforms in parallel
const [iosProject, androidProject] = await Promise.all([
  assetManager.generateCompleteAssetBundle({
    projectId: 'ios-123',
    appName: 'My App',
    platform: 'ios',
    // ... config
  }),
  assetManager.generateCompleteAssetBundle({
    projectId: 'android-123',
    appName: 'My App',
    platform: 'android',
    // ... config
  })
]);
```

### Caching

Assets are automatically optimized and can be cached in R2:

```typescript
// Check if assets already exist before regenerating
const stats = await storage.getProjectStorageStats('project-123');

if (stats.totalFiles > 0) {
  console.log('Assets already exist, using cached version');
  const urls = await storage.getProjectAssetUrls('project-123');
} else {
  console.log('Generating new assets');
  const project = await assetManager.generateCompleteAssetBundle({...});
}
```

## Troubleshooting

### Common Issues

1. **"CANVA_API_KEY is required"**
   - Ensure `.env` has `CANVA_API_KEY` set
   - Verify API key is valid and not expired

2. **"Export timeout - design did not complete in time"**
   - Canva's servers may be slow
   - Retry the operation
   - Consider increasing timeout in production

3. **"R2 upload failed"**
   - Verify R2 credentials are correct
   - Check bucket exists and is accessible
   - Ensure sufficient storage quota

4. **"Invalid iOS screenshot size"**
   - Canva may have generated non-standard dimensions
   - Regenerate with explicit dimensions
   - Use `sharp` to resize if needed

## Roadmap

- [ ] Support for App Preview videos (iOS)
- [ ] Animated feature graphics
- [ ] A/B testing for screenshots
- [ ] Localization support (multi-language assets)
- [ ] Asset templates library
- [ ] Batch operations for multiple apps
- [ ] AI-powered asset optimization suggestions

## Support

For issues or questions:
- GitHub Issues: [PlusUltra Issues](https://github.com/plusultra/backend/issues)
- Documentation: [PlusUltra Docs](https://docs.plusultra.dev)
- Email: support@plusultra.dev
