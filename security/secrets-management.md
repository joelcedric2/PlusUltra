# 🔐 CI/CD Secrets Management & Rotation Policy

## Overview
This document defines the least-privilege access controls, rotation schedules, and management procedures for all secrets used in PlusUltra's CI/CD pipelines.

## 🔒 Least Privilege Principles

### Secret Access Levels
| Secret Name | Access Level | Purpose | Rotation |
|-------------|--------------|---------|----------|
| **APP_STORE_CONNECT_PRIVATE_KEY** | **Minimal** | iOS App Store uploads only | Annual |
| **IOS_DISTRIBUTION_CERT** | **Minimal** | iOS code signing only | Annual |
| **IOS_CERT_PASSWORD** | **Minimal** | Certificate decryption only | Annual |
| **GOOGLE_PLAY_JSON_KEY** | **Minimal** | Android Play Store uploads only | Annual |
| **ANDROID_KEYSTORE** | **Minimal** | Android app signing only | Never* |
| **ANDROID_KEYSTORE_PASSWORD** | **Minimal** | Keystore access only | Never* |
| **EXPO_TOKEN** | **Minimal** | EAS Build access only | Annual |
| **DATABASE_URL** | **Minimal** | Production DB access only | Quarterly |

*Android keystores are permanent and should never be rotated as it breaks app updates

### Environment-Based Access
- **Development**: No production secrets, test credentials only
- **Staging**: Limited production secrets for testing
- **Production**: Full production secret access

## 🔄 Rotation Schedule & Procedures

### Automated Rotation (Recommended)
```bash
#!/bin/bash
# scripts/rotate-secrets.sh
set -e

echo "🔄 Starting secrets rotation..."

# 1. Generate new secrets
echo "Generating new App Store Connect key..."
# Apple Developer Portal → New API Key

echo "Generating new Google service account..."
# Google Cloud Console → New service account

# 2. Update GitHub Secrets
echo "Updating GitHub repository secrets..."
gh secret set APP_STORE_CONNECT_PRIVATE_KEY -b"$(cat new-key.p8 | base64)"
gh secret set GOOGLE_PLAY_JSON_KEY -b"$(cat new-service-account.json | base64)"

# 3. Update documentation
echo "Updating rotation timestamp in security/keystore-ops.md"
sed -i "s/Last Rotation: .*/Last Rotation: $(date)/" security/keystore-ops.md

# 4. Test deployment
echo "Testing deployment with new secrets..."
gh workflow run release.yml --ref main

echo "✅ Secrets rotation completed"
```

### Manual Rotation Checklist
**Monthly (First Monday of each month)**:
- [ ] Review all active secrets for necessity
- [ ] Check expiry dates of certificates
- [ ] Verify access logs for unusual activity
- [ ] Update secret access permissions if needed

**Quarterly (End of quarter)**:
- [ ] Rotate database credentials
- [ ] Update EAS CLI token
- [ ] Review and update service account permissions

**Annual (Certificate expiry)**:
- [ ] Rotate iOS certificates (Apple requirement)
- [ ] Rotate Google service accounts
- [ ] Update all related documentation

## 🛡️ Access Control Implementation

### GitHub Repository Settings
```bash
# Set repository-level secret access
gh api repos/:owner/:repo/actions/permissions \
  -f allowed_actions="selected" \
  -f github_owned_allowed=true \
  -f verified_allowed=false

# Configure environment protection
gh api repos/:owner/:repo/environments/production \
  -f wait_timer=0 \
  -f reviewers='[{"type":"User","id":12345}]'
```

### Branch Protection Rules
- **Main branch**: Require PR reviews and status checks
- **Release branches**: Require admin approval
- **Feature branches**: Allow self-approval for development

### Workflow Security
```yaml
# In .github/workflows/release.yml
jobs:
  deploy:
    environment: production  # Requires approval for prod deployments
    steps:
      - name: Verify deployment permissions
        run: |
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "Manual deployment approved"
          elif [[ "${{ github.event.head_commit.author.email }}" != "ci@github-actions" ]]; then
            echo "Unauthorized deployment attempt"
            exit 1
          fi
```

## 🔍 Monitoring & Alerting

### Secret Access Monitoring
```bash
#!/bin/bash
# scripts/monitor-secret-access.sh
echo "🔍 Monitoring secret access patterns..."

# Check GitHub audit logs
gh api repos/:owner/:repo/actions/secrets/audit-log \
  --paginate | jq '.[] | select(.action == "accessed") | .timestamp'

# Alert on unusual access patterns
UNUSUAL_ACCESS=$(gh api repos/:owner/:repo/actions/secrets/audit-log \
  --paginate | jq '[.[] | select(.action == "accessed" and .timestamp > "'$(date -d '1 hour ago' -Iseconds)'")] | length')

if [[ $UNUSUAL_ACCESS -gt 5 ]]; then
  echo "🚨 Unusual secret access detected: $UNUSUAL_ACCESS accesses in last hour"
  # Send alert to security team
fi
```

### Certificate Expiry Alerts
```bash
#!/bin/bash
# scripts/cert-expiry-alerts.sh
echo "📅 Checking certificate expiry dates..."

# iOS Certificate expiry check
IOS_EXPIRY=$(openssl pkcs12 -in <(echo "${IOS_CERT}" | base64 -d) \
  -passin pass:"${IOS_CERT_PASSWORD}" -noout -enddate 2>/dev/null | grep "notAfter" | cut -d'=' -f2)

if [[ $(date -d "$IOS_EXPIRY" +%s) -lt $(date -d '+30 days' +%s') ]]; then
  echo "⚠️ iOS Certificate expires in less than 30 days: $IOS_EXPIRY"
fi

# Android keystore creation date (for reference)
ANDROID_CREATED=$(keytool -list -keystore <(echo "${ANDROID_KEYSTORE}" | base64 -d) \
  -storepass "${ANDROID_KEYSTORE_PASSWORD}" 2>/dev/null | grep "Creation date" | cut -d':' -f2)
```

## 🚨 Incident Response

### Secret Compromise Response
**Level 1: Suspicious Access**
1. **Immediate**: Review access logs for unauthorized usage
2. **Short-term**: Temporarily disable affected secrets
3. **Investigation**: Identify source of compromise
4. **Resolution**: Rotate affected secrets and investigate root cause

**Level 2: Confirmed Breach**
1. **Immediate**: Disable all related secrets and workflows
2. **Containment**: Isolate affected systems and credentials
3. **Recovery**: Generate new secrets and update all systems
4. **Notification**: Alert security team and affected parties

### Emergency Contacts
| Role | Contact | Escalation |
|------|---------|------------|
| **Security Lead** | security@plusultra.dev | Immediate |
| **DevOps Lead** | devops@plusultra.dev | Within 1 hour |
| **CEO** | ceo@plusultra.dev | Within 24 hours |

## 📋 Compliance Requirements

### GDPR Compliance
- **Data Processing**: All secrets handling logged for audit
- **Access Controls**: Least privilege access enforced
- **Retention**: Secret access logs retained for 7 years

### SOC2 Compliance
- **Access Monitoring**: Continuous monitoring of secret usage
- **Change Management**: All secret changes documented
- **Incident Response**: Documented procedures for security incidents

## 🔧 Tools & Scripts

### Secret Management Scripts
```bash
# scripts/manage-secrets.sh
#!/bin/bash
COMMAND=$1

case $COMMAND in
  "list")
    gh secret list
    ;;
  "rotate")
    ./scripts/rotate-secrets.sh
    ;;
  "audit")
    ./scripts/monitor-secret-access.sh
    ;;
  "backup")
    ./scripts/backup-secrets.sh
    ;;
esac
```

### Automated Monitoring Setup
```bash
# Setup cron jobs for monitoring
crontab -l | grep -v "secret-monitoring" > /tmp/crontab.tmp
echo "0 * * * * /path/to/scripts/monitor-secret-access.sh" >> /tmp/crontab.tmp
echo "0 0 * * 1 /path/to/scripts/cert-expiry-alerts.sh" >> /tmp/crontab.tmp
crontab /tmp/crontab.tmp
```

## 📚 Documentation Updates

### After Any Secret Change:
1. **Update this document** with new rotation dates and key details
2. **Update security/keystore-ops.md** with current key information
3. **Commit changes** to documentation repository
4. **Notify team** of any access permission changes

### Version Control for Secrets
```bash
# Track secret versions in separate encrypted file
echo "Secret rotation log:" >> security/secret-versions.enc
echo "$(date): Rotated APP_STORE_CONNECT_PRIVATE_KEY (new expiry: $(date -d '+1 year'))" | \
  sops --encrypt --pgp YOUR_PGP_KEY_ID /dev/stdin >> security/secret-versions.enc
```

## ✅ Verification Commands

```bash
# Test secret accessibility (without exposing values)
gh secret list | grep -E "(APP_STORE|ANDROID|GOOGLE_PLAY)"

# Verify certificate validity
openssl pkcs12 -in <(echo "${IOS_CERT}" | base64 -d) -passin pass:"${IOS_CERT_PASSWORD}" -noout -dates

# Check service account permissions
gcloud iam service-accounts describe $(echo "${GOOGLE_PLAY_JSON_KEY}" | base64 -d | jq -r '.client_email')
```

## 🚨 Emergency Procedures

**If secrets are compromised:**
1. **IMMEDIATE**: Disable all GitHub workflows
2. **CONTAIN**: Revoke all related API keys and certificates
3. **ROTATE**: Generate new secrets and update all systems
4. **INVESTIGATE**: Analyze access logs and git history
5. **COMMUNICATE**: Notify all stakeholders within 1 hour

**Recovery Time Objective**: < 4 hours for critical secrets
**Recovery Point Objective**: < 1 day of lost functionality
