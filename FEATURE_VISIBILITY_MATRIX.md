# PlusUltra Feature Visibility Matrix

Categorization of all features by visibility and control model.

---

## 🔒 Under the Hood (Automatic, Admin-Only)

These features run automatically in the background. Users benefit from them but don't control them directly. Only admins can see metrics/dashboards.

### **Quality & Validation**

1. **TCI 6-Layer Analysis** 🔧
   - **What**: Multi-model code analysis (DeepSeek, Claude, GPT, Grok, Gemini)
   - **When**: Runs automatically during code generation
   - **User sees**: Final quality score/verdict (APPROVE/REJECT/NEEDS_REVISION)
   - **Admin sees**: Full 6-layer breakdown, timing metrics, model performance
   - **Location**: Happens in orchestration pipeline before code is shown to user

2. **Multi-Model Consensus** 🗳️
   - **What**: Weighted voting system across AI models
   - **When**: Every AI code generation request
   - **User sees**: "Verified by 5 AI models" badge
   - **Admin sees**: Consensus scores, conflict detection, quarantine triggers
   - **Location**: Built into orchestration layer

3. **Blind Judge System** ⚖️
   - **What**: Claude judges code quality without seeing other model scores
   - **When**: After code generation, before showing to user
   - **User sees**: Quality confidence score
   - **Admin sees**: Claude's judgment vs other models, bias detection
   - **Location**: Part of TCI validation pipeline

4. **Model Quarantine** 🚨
   - **What**: Automatically disables underperforming AI models
   - **When**: When model reliability drops below threshold
   - **User sees**: Nothing (seamless failover to other models)
   - **Admin sees**: Quarantined models, failure reasons, recovery status
   - **Location**: Real-time monitoring in orchestration

5. **Confidence Scoring** 📊
   - **What**: Per-model and aggregate confidence tracking
   - **When**: Every AI interaction
   - **User sees**: Overall confidence percentage
   - **Admin sees**: Per-model confidence breakdown, trends over time
   - **Location**: Embedded in all AI responses

### **Reliability & Performance**

6. **Circuit Breakers** 🔌
   - **What**: Prevents cascading failures to external APIs (OpenAI, Stripe, GitHub)
   - **When**: Automatic when API failures exceed threshold
   - **User sees**: "Service temporarily unavailable" (rare)
   - **Admin sees**: Circuit state, failure counts, recovery times
   - **Location**: Server-level protection (`server.ts:66`)

7. **Self-Healing Debugging** 🩹
   - **What**: Automatic error detection and fixing during development
   - **When**: Monitors sandbox containers for errors, auto-applies fixes
   - **User sees**: "TCI detected and fixed 3 issues" notification
   - **Admin sees**: Fix success rate, error patterns, model accuracy
   - **Location**: Sandbox monitoring service

8. **Job Queue Auto-Scaling** ⚡
   - **What**: Dynamic worker scaling based on queue depth
   - **When**: Continuously monitors queue, scales workers 1-10
   - **User sees**: Fast response times (don't see the scaling)
   - **Admin sees**: Worker count, queue depth, scaling events
   - **Location**: `DynamicScalingService`

9. **Latency Breaker** ⏱️
   - **What**: Kills slow AI requests, returns cached/fallback results
   - **When**: Request exceeds timeout threshold
   - **User sees**: Fast responses (even if fallback)
   - **Admin sees**: Timeout events, fallback usage, latency metrics
   - **Location**: TCI orchestration layer

### **Learning & Optimization**

10. **Learning Loop** 🧠
    - **What**: Tracks TCI accuracy, adjusts model weights based on outcomes
    - **When**: After user submits feedback on analysis accuracy
    - **User sees**: "Thanks for feedback!" message
    - **Admin sees**: Model accuracy trends, weight adjustments, learning curves
    - **Location**: `TCIFeedback` → `ModelWeight` updates

11. **Pattern Library** 📚
    - **What**: Grows database of known bug patterns from user feedback
    - **When**: Continuously as users submit actual outcomes
    - **User sees**: Better predictions over time
    - **Admin sees**: Pattern library size, detection accuracy per pattern
    - **Location**: `TCIPattern` table, updated by feedback service

12. **Schema Validation** ✅
    - **What**: Validates generated code against TypeScript/JSON schemas
    - **When**: Automatic after code generation
    - **User sees**: "Code validated" checkmark
    - **Admin sees**: Validation pass/fail rates, common schema errors
    - **Location**: `SchemaValidationLayer`

### **Compliance & Security**

13. **Audit Logging** 📝
    - **What**: Records all user actions, API calls, data access
    - **When**: Every significant action (create project, generate code, deploy)
    - **User sees**: Nothing (or optional audit trail in settings)
    - **Admin sees**: Complete audit dashboard, compliance reports
    - **Location**: `AuditLog` table, middleware

14. **Token Economy Metering** 💰
    - **What**: Tracks token usage per user/tier, enforces limits
    - **When**: Every AI request deducts from user's token pool
    - **User sees**: Token balance, usage stats
    - **Admin sees**: Per-model costs, revenue attribution, abuse detection
    - **Location**: Token tracking middleware

15. **Embedding Cache** 💾
    - **What**: Caches AI embeddings to reduce costs and improve speed
    - **When**: Automatic for repeated queries
    - **User sees**: Faster responses
    - **Admin sees**: Cache hit rate, cost savings, cache size
    - **Location**: `EmbeddingCache` service

16. **Temporal Code Intelligence (TCI)** 🕰️
    - **What**: Graph-based code history tracking and analysis
    - **When**: Tracks every code change, builds knowledge graph
    - **User sees**: Code suggestions based on project history
    - **Admin sees**: Graph size, query performance, accuracy metrics
    - **Location**: Neo4j graph database

---

## 🎛️ Frontend Toggled (User-Controlled)

These features have explicit on/off toggles in the user interface. Users choose when to use them.

### **AI Assistance**

17. **AI Product Manager** 🤖
    - **Toggle**: Settings → Enable AI Product Manager
    - **What**: AI suggests features, creates epics, prioritizes backlog
    - **Default**: OFF (user must enable)
    - **Why toggle**: Some users want manual control over roadmap
    - **Backend impact**: Skips AI PM suggestions in project creation

18. **TCI Chat Assistant** 💬
    - **Toggle**: Chat button in IDE/editor
    - **What**: Ask TCI questions about your code
    - **Default**: Available (but must click to use)
    - **Why toggle**: Opt-in interaction, not forced
    - **Backend impact**: Only runs when user sends chat message

19. **AI-Era Collaboration** 🤝
    - **Toggle**: Project Settings → Advanced Collaboration
    - **What**: AI-powered conflict resolution, smart merging
    - **Default**: OFF (opt-in for teams)
    - **Why toggle**: Teams may prefer manual merge resolution
    - **Backend impact**: Uses standard Git merge if disabled

### **Integrations**

20. **GitHub Integration** 🐙
    - **Toggle**: Settings → Connect GitHub
    - **What**: Auto-create repos, sync code, deploy from GitHub
    - **Default**: Disconnected
    - **Why toggle**: Privacy, user may use different VCS
    - **Backend impact**: Skips GitHub API calls if not connected

21. **Auto-Deploy** 🚀
    - **Toggle**: Project Settings → Auto-Deploy on Commit
    - **What**: Automatic deployment when code is pushed
    - **Default**: OFF (manual deploy)
    - **Why toggle**: Users may want staging/review before deploy
    - **Backend impact**: Webhook triggers build pipeline

22. **Supabase Provisioning** 🗄️
    - **Toggle**: Project Settings → Auto-Provision Database
    - **What**: Automatically creates Supabase project for new apps
    - **Default**: OFF (user chooses backend)
    - **Why toggle**: User may have existing database or use Firebase
    - **Backend impact**: Skips Supabase API calls

### **Build & Deploy**

23. **Sandbox Testing** 🧪
    - **Toggle**: "Test in Sandbox" button (per-request)
    - **What**: Spin up Docker container to test code
    - **Default**: Available but must click
    - **Why toggle**: Uses resources, user chooses when to test
    - **Backend impact**: Spins up Docker container on demand

24. **EAS Build Service** 📱
    - **Toggle**: "Build Mobile App" button
    - **What**: Triggers Expo build for iOS/Android
    - **Default**: Available but must initiate
    - **Why toggle**: Builds cost money, user controls when to build
    - **Backend impact**: Calls Expo EAS API

25. **App Store Deployment** 🏪
    - **Toggle**: "Deploy to App Store" button
    - **What**: Submits app to Apple App Store / Google Play
    - **Default**: Manual trigger
    - **Why toggle**: Final approval step, legal/compliance review needed
    - **Backend impact**: Calls App Store Connect / Play Console APIs

### **Collaboration**

26. **Real-time Collaboration** 👥
    - **Toggle**: "Start Collaboration Session" button
    - **What**: Live multi-user editing (Google Docs style)
    - **Default**: OFF (single-user mode)
    - **Why toggle**: User may work alone, collaboration uses WebSocket resources
    - **Backend impact**: Opens WebSocket, starts Y.js CRDT sync

27. **Live Preview** 👀
    - **Toggle**: "Enable Live Preview" in sandbox
    - **What**: Real-time preview of running app
    - **Default**: OFF (static code view)
    - **Why toggle**: Uses port forwarding, may slow down editor
    - **Backend impact**: Allocates port, proxies preview server

### **Export & Publishing**

28. **Multi-Platform Export** 📦
    - **Toggle**: "Export" dropdown (per-request)
    - **What**: Export project as React Native, Flutter, etc.
    - **Default**: Available but must select
    - **Why toggle**: User chooses target platform
    - **Backend impact**: Runs code transformation pipeline

29. **Asset Generation** 🎨
    - **Toggle**: "Generate Assets" button
    - **What**: AI-generated app icons, screenshots, feature graphics
    - **Default**: Manual trigger
    - **Why toggle**: User may have existing branding
    - **Backend impact**: Calls Canva API

### **Privacy & Data**

30. **Analytics Tracking** 📈
    - **Toggle**: Settings → Share Usage Analytics
    - **What**: Track feature usage, error reports (PostHog)
    - **Default**: ON (can disable)
    - **Why toggle**: Privacy preference, GDPR compliance
    - **Backend impact**: Skips analytics events if disabled

31. **Error Reporting** 🐛
    - **Toggle**: Settings → Send Error Reports
    - **What**: Automatic error reporting to Sentry
    - **Default**: ON (can disable)
    - **Why toggle**: Privacy, user may not want crash data sent
    - **Backend impact**: Skips Sentry events if disabled

---

## 🔀 Hybrid (Automatic + User Override)

These run automatically but users can override/customize.

32. **Token Limits** 🎫
    - **Automatic**: Enforces tier-based limits (Free: 50K, Pro: 1M)
    - **User control**: Can see usage, request limit increase
    - **Admin control**: Can manually adjust limits per user

33. **RBAC (Roles & Permissions)** 🔐
    - **Automatic**: Default roles assigned (Owner, Admin, Developer, Viewer)
    - **User control**: Project owners can customize roles
    - **Admin control**: Override any permission

34. **Workspace TTL** ⏰
    - **Automatic**: Sandboxes auto-delete after 1 hour of inactivity
    - **User control**: Can manually extend/delete workspace
    - **Admin control**: Override TTL limits

---

## 📊 Admin Dashboard Requirements

Based on "Under the Hood" features, admins need visibility into:

### **TCI & Quality Metrics**
- TCI 6-layer analysis breakdown (visual, causal, historical, logic, synthesis, implementation)
- Per-layer accuracy rates and confidence scores
- Model consensus rates and conflict frequency
- Blind judge agreement rates with consensus
- Pattern library growth and detection accuracy
- Learning loop model weight adjustments

### **Model Performance**
- Per-model (GPT, Claude, Gemini, Grok, DeepSeek) reliability scores
- Quarantine events and recovery status
- Latency distribution per model
- Cost per model per request
- Token usage by model

### **System Health**
- Circuit breaker states (OpenAI, Stripe, GitHub, Supabase)
- Job queue depth and worker scaling events
- Cache hit rates (embedding cache, Redis)
- Self-healing debug success rates
- Schema validation pass/fail rates

### **Compliance & Security**
- Audit log viewer with search/filter
- User token usage and abuse detection
- API rate limit violations
- Data retention compliance status

### **Revenue & Usage**
- Token economy revenue attribution
- Cost per tier (Free subsidy, Pro/Enterprise profit)
- Feature usage by tier (which features drive upgrades?)
- Churn prediction based on usage patterns

---

## 🎨 Frontend UI Requirements

Based on "Frontend Toggled" features, users need:

### **Settings Panel**
- AI Product Manager toggle
- GitHub connection status + connect button
- Auto-deploy toggle per project
- Collaboration mode toggle
- Privacy toggles (analytics, error reporting)
- Token usage dashboard

### **Project Controls**
- Sandbox testing button
- Live preview toggle
- Build mobile app button
- Deploy to stores button
- Export format selector
- Generate assets button

### **Collaboration UI**
- Start collaboration session button
- Active users indicator
- Conflict resolution panel (when AI collab enabled)

### **Dashboard**
- Token balance and usage graph
- Recent TCI analysis results (high-level)
- Build/deploy status
- Collaboration session history

---

## 🚦 Implementation Priority

### **Phase 1: Critical (Backend Already Built)** ✅
- TCI 6-Layer Analysis
- Multi-Model Consensus
- Circuit Breakers
- Token Economy
- Audit Logging

### **Phase 2: High Value (Build Next)**
- Admin Dashboard (TCI metrics, model performance, system health)
- Self-Healing Debugging service
- Learning Loop automation
- Model Quarantine auto-recovery

### **Phase 3: User Experience**
- Frontend toggles for all user-controlled features
- Settings panel UI
- Token usage dashboard
- TCI results viewer (user-facing quality scores)

### **Phase 4: Advanced**
- Pattern library visualization
- A/B testing framework
- Predictive churn analysis
- Revenue optimization dashboard

---

## 💡 Key Insights

### **What Makes a Feature "Under the Hood"?**
1. **Automatic/Mandatory**: Runs without user action (TCI, consensus, circuit breakers)
2. **Quality/Safety**: Protects user from bad output (quarantine, validation)
3. **Performance**: Optimizes behind the scenes (caching, auto-scaling)
4. **Compliance**: Legal/regulatory requirements (audit logs, GDPR)

### **What Makes a Feature "Frontend Toggled"?**
1. **Optional/Preference**: User may not want it (AI PM, auto-deploy)
2. **Resource-Intensive**: User controls when to use (sandbox, builds)
3. **Privacy-Sensitive**: User chooses data sharing (analytics, GitHub)
4. **Workflow-Dependent**: Depends on user's process (collaboration, live preview)

### **Admin Visibility Philosophy**
- **Under the hood features** → Full transparency in admin dashboard
- **Frontend toggled features** → Aggregate usage stats only (e.g., "73% of Pro users enable AI PM")
- **Hybrid features** → Both real-time status + usage analytics

---

**This matrix ensures the right features are visible to the right people at the right time.** 🎯
