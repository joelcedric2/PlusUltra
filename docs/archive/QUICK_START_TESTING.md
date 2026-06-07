# Quick Start Testing Guide

This guide helps you test all the newly implemented backend services.

---

## Prerequisites

### 1. Environment Setup

Create [.env](plusultra/backend/.env) with these keys:

```bash
# App Store (iOS)
APPLE_KEY_ID=ABC123XYZ
APPLE_ISSUER_ID=12345678-1234-1234-1234-123456789012
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
-----END PRIVATE KEY-----"
IOS_BUNDLE_ID=com.yourcompany.testapp

# Google Play (Android)
GOOGLE_SERVICE_ACCOUNT_EMAIL=service@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"..."}'
ANDROID_PACKAGE_NAME=com.yourcompany.testapp

# EAS Build
EAS_PROJECT_ID=your-expo-project-id
EXPO_TOKEN=your-expo-token

# Vercel
VERCEL_TOKEN=your-vercel-token

# Netlify
NETLIFY_TOKEN=your-netlify-token

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Anthropic (for rejection analysis)
ANTHROPIC_API_KEY=sk-ant-...

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/plusultra
REDIS_URL=redis://localhost:6379
```

### 2. Install Dependencies

```bash
cd plusultra/backend
npm install
```

### 3. Start Services

```bash
# Start PostgreSQL
docker run -d -p 5432:5432 \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=plusultra \
  postgres:15

# Start Redis
docker run -d -p 6379:6379 redis:7

# Start Neo4j (optional, for session replay)
docker run -d -p 7687:7687 -p 7474:7474 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:5
```

---

## Test 1: Authentication Service

### Test Sign Up

```typescript
// test-auth.ts
import { SupabaseAuthService } from './src/services/auth/SupabaseAuthService';

async function testAuth() {
  const authService = new SupabaseAuthService();

  // Sign up
  console.log('Testing sign up...');
  const signUpResult = await authService.signUp({
    email: 'test@example.com',
    password: 'SecurePassword123!',
    userData: {
      fullName: 'Test User',
      tier: 'free',
    },
  });

  if (signUpResult.error) {
    console.error('Sign up failed:', signUpResult.error);
    return;
  }

  console.log('✅ Sign up successful!');
  console.log('User ID:', signUpResult.user?.id);
  console.log('Access Token:', signUpResult.session?.access_token?.substring(0, 20) + '...');

  // Sign in
  console.log('\nTesting sign in...');
  const signInResult = await authService.signIn({
    email: 'test@example.com',
    password: 'SecurePassword123!',
  });

  if (signInResult.error) {
    console.error('Sign in failed:', signInResult.error);
    return;
  }

  console.log('✅ Sign in successful!');

  // Get profile
  const profile = await authService.getUserProfile(signInResult.user!.id);
  console.log('✅ Profile:', profile);

  // Generate API key
  const { apiKey, error } = await authService.generateApiKey(
    signInResult.user!.id,
    'Test Key'
  );

  if (error) {
    console.error('API key generation failed:', error);
    return;
  }

  console.log('✅ API Key generated:', apiKey.substring(0, 10) + '...');

  // Validate API key
  const validation = await authService.validateApiKey(apiKey);
  console.log('✅ API Key valid:', validation.valid);
}

testAuth();
```

Run:
```bash
npx ts-node test-auth.ts
```

Expected output:
```
Testing sign up...
✅ Sign up successful!
User ID: 12345678-1234-1234-1234-123456789012
Access Token: eyJhbGciOiJIUzI1NiIsI...

Testing sign in...
✅ Sign in successful!
✅ Profile: { id: '...', email: 'test@example.com', tier: 'free' }
✅ API Key generated: abc123def4...
✅ API Key valid: true
```

---

## Test 2: Project CRUD Service

```typescript
// test-projects.ts
import { ProjectService } from './src/services/storage/ProjectService';

async function testProjects() {
  const projectService = new ProjectService();
  const userId = 'your-user-id'; // From test 1

  // Create project
  console.log('Creating project...');
  const project = await projectService.createProject(userId, {
    name: 'Test Mobile App',
    description: 'A test project for PlusUltra',
    platform: 'both',
    framework: 'react-native',
    repositoryUrl: 'https://github.com/test/repo',
  });

  console.log('✅ Project created:', project.id);

  // Link assets
  console.log('\nLinking assets...');
  const assets = await projectService.linkAssetsToProject(project.id, [
    {
      type: 'logo',
      platform: 'ios',
      url: 'https://example.com/logo.png',
      metadata: { size: '1024x1024' },
    },
    {
      type: 'screenshot',
      platform: 'android',
      url: 'https://example.com/screenshot1.png',
    },
  ]);

  console.log('✅ Assets linked:', assets.length);

  // Get project with assets
  const fetchedProject = await projectService.getProject(project.id, userId);
  console.log('✅ Project fetched with', fetchedProject?.assets?.length, 'assets');

  // Update project
  await projectService.updateProject(project.id, userId, {
    status: 'building',
  });
  console.log('✅ Project status updated');

  // Get user's projects
  const userProjects = await projectService.getUserProjects(userId);
  console.log('✅ User has', userProjects.length, 'projects');
}

testProjects();
```

---

## Test 3: Store Submission

### Test iOS Submission (Sandbox)

```typescript
// test-ios-submission.ts
import { StoreSubmissionOrchestrator } from './src/services/publishing/StoreSubmissionOrchestrator';

async function testIOSSubmission() {
  const orchestrator = StoreSubmissionOrchestrator.fromEnv();

  console.log('Starting iOS submission...');

  const result = await orchestrator.submitApp({
    projectPath: '/path/to/your/test/project',
    platform: 'ios',
    appName: 'Test App',
    bundleId: 'com.yourcompany.testapp',
    packageName: 'com.yourcompany.testapp',
    version: '1.0.0',
    buildNumber: '1',
    description: 'This is a test app for PlusUltra store submission',
    keywords: ['test', 'demo', 'development'],
    releaseNotes: 'Initial release',
    locale: 'en-US',
  });

  if (result.ios?.success) {
    console.log('✅ iOS submission successful!');
    console.log('Submission ID:', result.ios.submission?.submissionId);
    console.log('Store URL:', result.ios.submission?.storeUrl);
  } else {
    console.error('❌ iOS submission failed:', result.ios?.error);
  }
}

testIOSSubmission();
```

### Test Rejection Handling

```typescript
// test-rejection-handler.ts
import { RejectionHandler } from './src/services/publishing/RejectionHandler';
import { StoreSubmissionOrchestrator } from './src/services/publishing/StoreSubmissionOrchestrator';

async function testRejectionHandler() {
  const orchestrator = StoreSubmissionOrchestrator.fromEnv();
  const handler = new RejectionHandler(orchestrator);

  // Simulate a rejection analysis
  console.log('Analyzing rejection...');

  const analysis = await handler.analyzeRejection({
    platform: 'ios',
    versionId: 'test-version-id',
  });

  console.log('Rejection analysis:', analysis);

  if (analysis.autoFixable) {
    console.log('✅ Issues can be auto-fixed!');
    console.log('Suggested fixes:', analysis.suggestedFixes);
  } else {
    console.log('⚠️ Manual review required');
    console.log('Category:', analysis.category);
  }
}

testRejectionHandler();
```

---

## Test 4: Web Deployment

### Test Vercel Deployment

```typescript
// test-vercel-deploy.ts
import { WebDeployService } from './src/services/publishing/WebDeployService';

async function testVercelDeploy() {
  const deployService = new WebDeployService();

  console.log('Deploying to Vercel...');

  const result = await deployService.deploy({
    platform: 'vercel',
    projectPath: '/path/to/your/nextjs/app',
    projectName: 'test-nextjs-app',
    framework: 'nextjs',
    buildCommand: 'npm run build',
    outputDirectory: '.next',
    environmentVariables: {
      NEXT_PUBLIC_API_URL: 'https://api.test.com',
    },
  });

  if (result.success) {
    console.log('✅ Deployment successful!');
    console.log('URL:', result.url);
    console.log('Build time:', result.buildTime, 'ms');
  } else {
    console.error('❌ Deployment failed:', result.error);
  }
}

testVercelDeploy();
```

### Test Netlify Deployment

```typescript
// test-netlify-deploy.ts
import { WebDeployService } from './src/services/publishing/WebDeployService';

async function testNetlifyDeploy() {
  const deployService = new WebDeployService();

  console.log('Deploying to Netlify...');

  const result = await deployService.deploy({
    platform: 'netlify',
    projectPath: '/path/to/your/react/app',
    projectName: 'test-react-app',
    framework: 'react',
  });

  if (result.success) {
    console.log('✅ Deployment successful!');
    console.log('URL:', result.url);
  } else {
    console.error('❌ Deployment failed:', result.error);
  }
}

testNetlifyDeploy();
```

---

## Test 5: End-to-End Workflow

Complete workflow from project creation to store submission:

```typescript
// test-e2e-workflow.ts
import { SupabaseAuthService } from './src/services/auth/SupabaseAuthService';
import { ProjectService } from './src/services/storage/ProjectService';
import { StoreSubmissionOrchestrator } from './src/services/publishing/StoreSubmissionOrchestrator';

async function testE2EWorkflow() {
  console.log('🚀 Starting end-to-end workflow test\n');

  // 1. Authentication
  console.log('Step 1: Authenticating...');
  const authService = new SupabaseAuthService();
  const authResult = await authService.signIn({
    email: 'test@example.com',
    password: 'SecurePassword123!',
  });

  if (authResult.error) {
    console.error('❌ Auth failed');
    return;
  }

  const userId = authResult.user!.id;
  console.log('✅ Authenticated as:', userId);

  // 2. Create Project
  console.log('\nStep 2: Creating project...');
  const projectService = new ProjectService();
  const project = await projectService.createProject(userId, {
    name: 'E2E Test App',
    description: 'End-to-end test application',
    platform: 'ios',
    framework: 'react-native',
  });
  console.log('✅ Project created:', project.id);

  // 3. Link Assets
  console.log('\nStep 3: Linking assets...');
  await projectService.linkAssetsToProject(project.id, [
    {
      type: 'logo',
      platform: 'ios',
      url: 'https://example.com/logo.png',
    },
  ]);
  console.log('✅ Assets linked');

  // 4. Submit to App Store
  console.log('\nStep 4: Submitting to App Store...');
  const orchestrator = StoreSubmissionOrchestrator.fromEnv();
  const submissionResult = await orchestrator.submitApp({
    projectPath: '/path/to/project',
    platform: 'ios',
    appName: 'E2E Test App',
    bundleId: 'com.test.e2eapp',
    packageName: 'com.test.e2eapp',
    version: '1.0.0',
    buildNumber: '1',
    description: 'Test application for E2E workflow',
  });

  if (submissionResult.ios?.success) {
    console.log('✅ Submission successful!');
    console.log('Store URL:', submissionResult.ios.submission?.storeUrl);

    // 5. Update Project Status
    console.log('\nStep 5: Updating project status...');
    await projectService.updateProject(project.id, userId, {
      status: 'published',
    });
    console.log('✅ Project marked as published');
  } else {
    console.error('❌ Submission failed:', submissionResult.ios?.error);
  }

  console.log('\n🎉 End-to-end workflow complete!');
}

testE2EWorkflow();
```

---

## Common Issues & Solutions

### Issue: "Supabase URL not set"
**Solution:** Ensure [.env](plusultra/backend/.env) has `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### Issue: "Apple API authentication failed"
**Solution:**
1. Verify `APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_PRIVATE_KEY` are correct
2. Ensure private key includes BEGIN/END lines
3. Check key has App Store Connect API access

### Issue: "Google Play authentication failed"
**Solution:**
1. Verify service account JSON is valid
2. Ensure service account has "Release Manager" role in Play Console
3. Check `GOOGLE_SERVICE_ACCOUNT_EMAIL` matches JSON

### Issue: "EAS build failed"
**Solution:**
1. Verify `EAS_PROJECT_ID` matches your Expo project
2. Check `EXPO_TOKEN` is valid
3. Ensure eas.json is configured correctly

### Issue: "Vercel deployment timeout"
**Solution:**
1. Check build command is correct
2. Verify output directory exists
3. Ensure VERCEL_TOKEN has project access

---

## Monitoring Tests

### Check Logs

```bash
# Backend logs
tail -f plusultra/backend/logs/app.log

# Job queue logs (if using workers)
npx bullmq-cli logs plusultra-jobs

# Database logs
docker logs <postgres-container-id>
```

### Check Sentry (Error Tracking)

1. Visit Sentry dashboard
2. Filter by environment: "development"
3. Check for any errors from tests

### Check PostHog (Analytics)

1. Visit PostHog dashboard
2. Check "Live Events" to see tracked events
3. Verify usage metrics

---

## API Testing with cURL

### Test Authentication Endpoint

```bash
# Sign up
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "fullName": "Test User"
  }'

# Sign in
curl -X POST http://localhost:3000/api/v1/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }'
```

### Test Project Creation

```bash
# Create project (requires auth token)
curl -X POST http://localhost:3000/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-access-token>" \
  -d '{
    "name": "Test Project",
    "platform": "ios",
    "framework": "react-native"
  }'

# Get user projects
curl -X GET http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer <your-access-token>"
```

### Test Store Submission

```bash
# Submit to stores
curl -X POST http://localhost:3000/api/v1/store/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-access-token>" \
  -d '{
    "projectId": "project-uuid",
    "platform": "ios",
    "appName": "Test App",
    "version": "1.0.0",
    "description": "Test description"
  }'

# Check submission status
curl -X GET http://localhost:3000/api/v1/store/status/submission-id \
  -H "Authorization: Bearer <your-access-token>"
```

---

## Performance Benchmarks

Expected performance for key operations:

| Operation | Expected Time | Notes |
|-----------|--------------|-------|
| Sign Up | <500ms | Includes profile creation |
| Sign In | <300ms | Token generation |
| Create Project | <200ms | Database write |
| Link Assets | <100ms per asset | Network dependent |
| iOS Build | 5-15 min | EAS build time |
| Android Build | 8-20 min | EAS build time |
| iOS Submission | 2-5 min | Upload + review submission |
| Android Submission | 3-7 min | Upload + track update |
| Vercel Deploy | 30-90 sec | Build + deploy |
| Netlify Deploy | 45-120 sec | Build + deploy |

---

## Next Steps After Testing

1. **Set up CI/CD**
   ```yaml
   # .github/workflows/test.yml
   name: Test Backend
   on: [push]
   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v2
         - run: npm install
         - run: npm test
   ```

2. **Deploy to Staging**
   - Use Railway, Render, or AWS
   - Configure environment variables
   - Run smoke tests

3. **Set up Monitoring**
   - Configure Sentry alerts
   - Set up PostHog dashboards
   - Enable error notifications

4. **Load Testing**
   ```bash
   # Install k6
   brew install k6

   # Run load test
   k6 run load-test.js
   ```

5. **Security Audit**
   - Run `npm audit`
   - Check OWASP Top 10
   - Verify API rate limits
   - Test authentication flows

---

## Support & Resources

- **API Docs:** https://docs.plusultra.dev/api
- **Discord:** https://discord.gg/plusultra
- **GitHub Issues:** https://github.com/plusultra/backend/issues
- **Status Page:** https://status.plusultra.dev

---

## Troubleshooting Checklist

- [ ] All environment variables are set
- [ ] PostgreSQL is running
- [ ] Redis is running
- [ ] Supabase project is created
- [ ] Apple Developer account is active
- [ ] Google Play Console access configured
- [ ] EAS project is initialized
- [ ] API credentials are valid
- [ ] Network firewall allows API calls
- [ ] Dependencies are installed (`npm install`)
- [ ] Database migrations are run (`npx prisma migrate dev`)
- [ ] Server is running (`npm run dev`)

---

**Ready to test?** Start with Test 1 (Authentication) and work your way through each test sequentially.
