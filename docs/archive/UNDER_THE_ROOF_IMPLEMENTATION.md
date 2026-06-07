# "Under the Roof" Asset Generation - Implementation Guide

## Philosophy

**"Under the Roof"** features run automatically in the background, requiring zero configuration from users (especially non-coders). They make PlusUltra feel magical - complex AI-powered systems working invisibly to deliver amazing results.

This contrasts with **"Toggleable"** features (like Project Manager) where users have explicit control via UI switches.

## Asset Generation: "Under the Roof" Implementation

### User Experience Flow

1. **User triggers** (simple action):
   ```
   Frontend: User types "Build me a fintech app" in chat
   → Workspace detects project creation
   → Calls: POST /api/assets/generate { appName: "FinanceFlow" }
   ```

2. **Backend orchestrates** (invisible to user):
   ```
   ✓ Enhance prompt with Starcoder AI
   ✓ Query TCI for user preferences (Pro/Enterprise)
   ✓ Generate logo with Canva (iOS + Android sizes)
   ✓ Generate screenshots with device frames
   ✓ Generate feature graphic (Android)
   ✓ Validate store compliance
   ✓ Upload to Cloudflare R2
   ✓ Record in TCI for learning
   ✓ Return CDN URLs to frontend
   ```

3. **User sees** (instant magic):
   ```
   Frontend: "Your app assets are ready! ✨"
   → Shows logo preview
   → Shows 5-7 screenshot carousel
   → "Ready to publish" button enabled
   ```

**Non-coder perspective**: "I just said what I wanted, and it made everything professional-looking!"

---

## Architecture

### Services Created

#### 1. AssetOrchestrationService ("Traffic Controller")
**File**: `plusultra/backend/src/services/orchestration/AssetOrchestrationService.ts`

**Role**: Coordinates all asset generation in background
**Key Features**:
- ✅ Simple API: `generateAssetsFromPrompt({ appName, userPrompt })`
- ✅ Prompt enhancement via Starcoder
- ✅ TCI recommendations (Pro/Enterprise only)
- ✅ Smart caching (avoid regeneration)
- ✅ Automatic R2 upload
- ✅ Cost estimation
- ✅ Error handling with fallbacks

**Example Usage**:
```typescript
const orchestrator = new AssetOrchestrationService();

const result = await orchestrator.generateAssetsFromPrompt({
  userId: 'user_123',
  projectId: 'proj_456',
  appName: 'FinanceFlow',
  platform: 'both',
  userPrompt: 'fintech app with blue theme',
  preferences: {
    industry: 'fintech',
    colorScheme: ['#007AFF']
  }
});

// Result includes:
// - CDN URLs for all assets
// - TCI insights (Pro/Enterprise)
// - Generation time
// - Estimated cost (~$2)
```

#### 2. TCIAssetLearning ("Brain")
**File**: `plusultra/backend/src/services/tci/TCIAssetLearning.ts`

**Role**: Learns from all users to improve recommendations
**Key Features**:
- ✅ Records ALL generations (Free → Enterprise)
- ✅ Cross-user pattern learning
- ✅ Industry-specific recommendations (Pro/Enterprise)
- ✅ Success rate tracking
- ✅ A/B test result analysis (Enterprise)
- ✅ Compliance pattern detection

**Tiered Access**:
```
FREE/STARTER:
- Contributions are recorded ✓
- Benefits from global improvements ✓
- No access to recommendations ✗

PRO:
- All of above +
- AI-powered design recommendations ✓
- Historical preference tracking ✓
- Industry best practices ✓

ENTERPRISE:
- All of above +
- Full analytics dashboard ✓
- A/B testing insights ✓
- Custom pattern analysis ✓
```

**Example - Learning Loop**:
```typescript
// User generates assets
await tci.recordAssetGeneration({
  userId: 'user_123',
  projectId: 'proj_456',
  style: 'gradient',
  colorScheme: ['#007AFF', '#5856D6'],
  industry: 'fintech',
  success: true,
  storeApproval: true,
  userSatisfaction: 5
});

// Later, TCI recommends for Pro user:
const rec = await tci.getRecommendations('user_789', {
  industry: 'fintech',
  platform: 'ios'
});

// Returns:
// {
//   suggestedStyle: 'gradient',  // Learned from user_123!
//   suggestedColors: ['#007AFF', '#5856D6'],
//   reasoning: 'gradient style performs best in fintech (85% success)',
//   confidence: 87
// }
```

#### 3. API Routes (Frontend Interface)
**File**: `plusultra/backend/src/routes/assets.ts`

**Endpoints**:

1. **`POST /api/assets/generate`** - Main generation endpoint
   ```json
   Request:
   {
     "appName": "FinanceFlow",
     "platform": "both",
     "userPrompt": "fintech app with blue theme"
   }

   Response:
   {
     "success": true,
     "projectId": "proj_1234",
     "assets": {
       "logos": [
         { "platform": "ios", "url": "https://cdn.../logo.png", "variant": "app_icon" }
       ],
       "screenshots": [
         { "platform": "ios", "url": "https://cdn.../screen1.png", "screenNumber": 1 }
       ]
     },
     "tciInsights": {
       "optimizationSuggestions": ["Consider gradient backgrounds"],
       "confidenceScore": 87
     },
     "generationTime": 125000,
     "estimatedCost": 1.95
   }
   ```

2. **`GET /api/assets/recommendations`** - Get AI suggestions (Pro/Enterprise)
   ```json
   GET /api/assets/recommendations?industry=fintech&platform=ios

   Response:
   {
     "suggestedStyle": "gradient",
     "suggestedColors": ["#007AFF", "#5856D6"],
     "reasoning": "Based on 127 successful fintech apps",
     "confidence": 87,
     "industryBestPractices": [
       "Gradient backgrounds increase engagement by 23%",
       "Device frames improve conversion",
       "Consistent color schemes perform better"
     ]
   }
   ```

3. **`POST /api/assets/:projectId/rate`** - Rate assets (feeds TCI)
   ```json
   {
     "rating": 5,
     "feedback": "Looks amazing!"
   }
   ```

4. **`GET /api/assets/analytics`** - Platform-wide analytics (Enterprise)
   ```json
   Response:
   {
     "totalGenerations": 1247,
     "successRate": 87.3,
     "popularStyles": [
       { "style": "gradient", "count": 456 },
       { "style": "modern", "count": 342 }
     ],
     "industryTrends": {
       "fintech": {
         "topStyle": "gradient",
         "topColors": ["#007AFF", "#5856D6"],
         "avgSatisfaction": 4.7
       }
     }
   }
   ```

---

## Integration with Existing Services

### 1. Canva (Asset Generation)
**Already Implemented**: `plusultra/backend/src/services/assets/CanvaService.ts`

**Integration**:
```typescript
// AssetOrchestrationService uses CanvaService internally
const canvaService = new CanvaService();

// Generate logo
const logos = await canvaService.generateLogo({
  appName: 'FinanceFlow',
  style: tciRecommendations?.style || 'modern',
  colorScheme: tciRecommendations?.colors || ['#007AFF'],
  platforms: ['ios', 'android']
});

// Canva handles:
// - Design creation via API
// - AI enhancement (Magic Studio)
// - Export to store-compliant sizes
// - Validation
```

### 2. Starcoder (Prompt Enhancement)
**Already Implemented**: `plusultra/backend/src/services/ai/StarcoderService.ts`

**Integration**:
```typescript
// Enhance user's simple prompt
const enhanced = await starcoderService.generateCode(`
  Generate professional app store marketing for:
  - App: "FinanceFlow"
  - Industry: fintech
  - User said: "blue theme fintech app"

  Provide tagline and 5 screenshot descriptions.
`, { language: 'JSON' });

// Result:
// {
//   "tagline": "Transform your finances",
//   "screens": [
//     { "title": "Smart Budgeting", "description": "Track spending effortlessly" },
//     { "title": "Instant Insights", "description": "AI-powered recommendations" }
//     ...
//   ]
// }
```

### 3. Neo4j (TCI Learning)
**Already Implemented**: `plusultra/backend/src/services/temporal/Neo4jGraphService.ts`

**Integration**:
```typescript
// Record every generation in graph
await neo4j.executeQuery(`
  MATCH (u:User {id: $userId})
  CREATE (a:AssetGeneration {
    style: $style,
    colors: $colors,
    industry: $industry,
    success: $success,
    timestamp: datetime()
  })
  CREATE (u)-[:GENERATED]->(a)

  // Link to industry for pattern learning
  MERGE (i:Industry {name: $industry})
  CREATE (a)-[:FOR_INDUSTRY]->(i)
`);

// Query for recommendations
const patterns = await neo4j.executeQuery(`
  MATCH (i:Industry {name: 'fintech'})<-[:FOR_INDUSTRY]-(a:AssetGeneration)
  WHERE a.success = true AND a.storeApproval = true
  RETURN a.style, count(*) as count
  ORDER BY count DESC
  LIMIT 1
`);
// Returns: { style: 'gradient', count: 156 }
```

### 4. Cloudflare R2 (Storage)
**Already Implemented**: `plusultra/backend/src/services/storage/CloudflareR2Storage.ts`

**Integration**:
```typescript
// Automatic upload after generation
const storage = new AssetStorageIntegration({
  accountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID,
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  bucketName: 'plusultra-app-assets',
  cdnDomain: 'assets.plusultra.dev'
});

// Upload returns CDN URLs
const uploaded = await storage.uploadProjectAssets(project);

// Structure in R2:
// projects/
//   proj_456/
//     logo/
//       ios/
//         logo_ios_1234.png
//       android/
//         logo_android_5678.png
//     screenshot/
//       ios/
//         screenshot_ios_0001.png
//         screenshot_ios_0002.png
```

---

## Frontend Integration Guide

### Simple Implementation (Recommended for Non-Coders)

```typescript
// In your React/Next.js component
import { useState } from 'react';

function AssetGenerator() {
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState(null);

  const generateAssets = async (appName: string) => {
    setLoading(true);

    try {
      const response = await fetch('/api/assets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName,
          platform: 'both',
          userPrompt: `Generate professional assets for ${appName}`
        })
      });

      const result = await response.json();

      if (result.success) {
        setAssets(result.assets);
        // Show success toast
        showToast('Your app assets are ready! ✨');
      }
    } catch (error) {
      showToast('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {loading ? (
        <LoadingSpinner message="Generating your app assets..." />
      ) : assets ? (
        <AssetPreview
          logo={assets.logos[0].url}
          screenshots={assets.screenshots}
        />
      ) : (
        <button onClick={() => generateAssets('FinanceFlow')}>
          Generate Assets
        </button>
      )}
    </div>
  );
}
```

### Advanced Implementation (With TCI Recommendations)

```typescript
async function generateAssetsWithAI(appName: string, industry: string) {
  // Step 1: Get AI recommendations (Pro/Enterprise only)
  const recommendations = await fetch(
    `/api/assets/recommendations?industry=${industry}&platform=both`
  ).then(r => r.json());

  // Step 2: Generate with recommendations
  const result = await fetch('/api/assets/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appName,
      platform: 'both',
      preferences: {
        style: recommendations?.suggestedStyle || 'modern',
        colorScheme: recommendations?.suggestedColors || ['#007AFF'],
        industry
      }
    })
  }).then(r => r.json());

  // Step 3: Show AI insights to user
  if (result.tciInsights) {
    showInsights({
      suggestions: result.tciInsights.optimizationSuggestions,
      confidence: result.tciInsights.confidenceScore,
      reasoning: recommendations?.reasoning
    });
  }

  return result;
}
```

---

## TCI Learning Examples

### Example 1: Cross-User Learning (All Tiers)

```
User A (Free tier):
- Generates fintech app with gradient style
- Gets approved by App Store
- Rates 5/5 stars

TCI Records:
✓ Gradient + fintech = success
✓ Store approval = true
✓ User satisfaction = 5

User B (Starter tier):
- Generates fintech app (no specific style)
- TCI uses User A's data internally
- Gets better defaults automatically

Result: User B benefits from User A's success,
even though User B can't see recommendations.
```

### Example 2: Pro User Gets Recommendations

```
Pro User C:
- Wants to build healthcare app
- Calls /api/assets/recommendations?industry=healthcare

TCI Analyzes:
- 47 healthcare apps in database
- 32 used 'minimal' style → 87% store approval
- 15 used 'modern' style → 73% store approval

Returns:
{
  "suggestedStyle": "minimal",
  "suggestedColors": ["#4CAF50", "#2196F3"],
  "reasoning": "Minimal style performs best in healthcare (87% approval vs 73%)",
  "confidence": 91,
  "industryBestPractices": [
    "Clean, professional designs build trust",
    "Green/blue color schemes convey health and calm",
    "Avoid complex gradients in medical apps"
  ]
}
```

### Example 3: Enterprise Analytics

```
Enterprise Admin Dashboard:
- Views /api/assets/analytics

Sees:
{
  "totalGenerations": 1,247,
  "successRate": 87.3%,
  "popularStyles": [
    "gradient" (456 apps),
    "modern" (342 apps),
    "minimal" (289 apps)
  ],
  "industryTrends": {
    "fintech": { style: "gradient", satisfaction: 4.7 },
    "healthcare": { style: "minimal", satisfaction: 4.8 },
    "education": { style: "flat", satisfaction: 4.5 }
  },
  "complianceIssues": [
    "Icon dimensions" → 12 occurrences → "Auto-resize implemented"
  ]
}

Uses this to:
- Optimize platform-wide defaults
- Identify emerging trends
- Improve compliance automation
```

---

## Benefits of "Under the Roof" Approach

### For Non-Coders:
✅ **Zero Configuration**: Just say "build my app" and assets appear
✅ **Professional Quality**: AI ensures store-compliant, polished designs
✅ **No Design Skills**: Canva + Starcoder handle all creativity
✅ **Instant Results**: 2-3 minutes vs. days hiring designers
✅ **Cost Savings**: ~$2 vs. $500-2000 per app

### For Pro Users:
✅ **All of above +**
✅ **AI Recommendations**: TCI suggests optimal styles/colors
✅ **Learning History**: System remembers your preferences
✅ **Industry Insights**: Best practices from successful apps

### For Enterprise:
✅ **All of above +**
✅ **Full Analytics**: Platform-wide trends and patterns
✅ **A/B Testing**: Track which designs perform best
✅ **Custom Optimization**: Tailored to your app portfolio

### For the Platform (PlusUltra):
✅ **Continuous Improvement**: Every generation makes TCI smarter
✅ **Network Effects**: More users = better recommendations for all
✅ **Competitive Moat**: Proprietary design intelligence
✅ **Retention**: Users see quality improvements over time

---

## Deployment Checklist

### Required Environment Variables

```bash
# Canva API
CANVA_API_KEY=your-canva-api-key
CANVA_BRAND_ID=optional-brand-id

# Cloudflare R2
CLOUDFLARE_R2_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_ACCESS_KEY_ID=your-access-key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-secret-key
CLOUDFLARE_R2_BUCKET_NAME=plusultra-app-assets
CLOUDFLARE_R2_CDN_DOMAIN=assets.plusultra.dev

# Neo4j (TCI)
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password

# HuggingFace (Starcoder)
HUGGINGFACE_API_KEY=your-hf-api-key
```

### Testing

```bash
# 1. Start backend
cd plusultra/backend
npm run dev

# 2. Test generation endpoint
curl -X POST http://localhost:3000/api/assets/generate \
  -H "Content-Type: application/json" \
  -d '{
    "appName": "TestApp",
    "platform": "both",
    "userPrompt": "fintech app"
  }'

# 3. Verify R2 upload
# Check https://dash.cloudflare.com → R2
# Should see: projects/proj_*/logo/ios/...

# 4. Check Neo4j
# Open Neo4j Browser: http://localhost:7474
# Run: MATCH (a:AssetGeneration) RETURN a LIMIT 10
```

---

## Next Steps

1. **Frontend Integration**:
   - Add "Generate Assets" button in Workspace
   - Show loading state during generation (2-3 min)
   - Display asset preview carousel
   - Enable "Publish Now" after assets ready

2. **User Onboarding**:
   - First-time users: Auto-trigger generation on project creation
   - Show quick preview: "We're creating your app logo and screenshots..."
   - After generation: "Your assets are ready! Want to see them?"

3. **Pro Tier Prompts**:
   - "💡 Tip: Upgrade to Pro for AI-powered design recommendations"
   - Show confidence score: "87% confident this will perform well"
   - Preview industry best practices

4. **Enterprise Dashboard**:
   - Add analytics widget to admin panel
   - Show trending styles/colors
   - Display A/B test results

---

## Summary

✅ **Created**: 3 new services (Orchestration, TCI Learning, API Routes)
✅ **Integrated**: Canva, Starcoder, Neo4j, R2 Storage
✅ **Implemented**: Tiered access (Free → Enterprise)
✅ **Documented**: Complete "under the roof" philosophy
✅ **Ready**: For frontend integration and production deployment

**Impact**: Non-coders can now generate professional app store assets in 2-3 minutes with zero design skills, powered by AI that learns from every user to get better over time.

**Next**: Implement store submission automation (App Store Connect + Google Play APIs) to complete the "one-click after setup" publishing flow.
