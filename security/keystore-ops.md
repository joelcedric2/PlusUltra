# 🔐 Key Custody & Recovery Operations

## Overview
This document outlines the secure management, storage, and recovery procedures for all cryptographic keys and certificates used in the PlusUltra mobile deployment pipeline.

## ⚠️ Critical Security Requirements

**NEVER** store private keys, certificates, or secrets in:
- Git repositories (even with .gitignore)
- Unencrypted files or drives
- Shared drives or cloud storage without encryption
- Email or messaging platforms

## 🔑 Key Inventory

### iOS Deployment Keys
| Key Type | Purpose | Storage Location | Rotation Schedule |
|----------|---------|-----------------|------------------|
| **App Store Connect API Key** | TestFlight/App Store uploads | GitHub Secrets (base64) | Annual |
| **iOS Distribution Certificate** | Code signing | GitHub Secrets (base64) | Annual (Apple requirement) |
| **iOS Provisioning Profile** | App ID linking | GitHub Secrets (base64) | Annual |

### Android Deployment Keys
| Key Type | Purpose | Storage Location | Rotation Schedule |
|----------|---------|-----------------|------------------|
| **Google Play Service Account** | Play Store API access | GitHub Secrets (JSON) | Annual |
| **Android Keystore** | App signing | GitHub Secrets (base64) | Never (permanent) |
| **Upload Key** | Play Store uploads | GitHub Secrets (base64) | Annual |

### Development Keys
| Key Type | Purpose | Storage Location | Rotation Schedule |
|----------|---------|-----------------|------------------|
| **EAS CLI Token** | EAS Build access | GitHub Secrets | Annual |
| **GitHub PAT** | Repository access | GitHub Secrets | 90 days |

## 🔒 Secure Storage Solutions

### Primary Storage (GitHub Secrets)
```bash
# Upload iOS keys
gh secret set APP_STORE_CONNECT_PRIVATE_KEY -b"$(cat AuthKey_XXXXXXXXXX.p8 | base64)"
gh secret set IOS_DISTRIBUTION_CERT -b"$(cat distribution.p12 | base64)"
gh secret set IOS_CERT_PASSWORD -b"your_secure_password"

# Upload Android keys
gh secret set GOOGLE_PLAY_JSON_KEY -b"$(cat service-account.json | base64)"
gh secret set ANDROID_KEYSTORE -b"$(cat release.keystore | base64)"
gh secret set ANDROID_KEYSTORE_PASSWORD -b"your_keystore_password"
```

### Backup Storage (Encrypted Vault)
**Option 1: HashiCorp Vault**
```bash
# Initialize Vault
vault secrets enable -path=plusultra kv-v2

# Store with encryption
vault kv put plusultra/ios/app-store-key content="$(cat AuthKey_XXXXXXXXXX.p8)"
vault kv put plusultra/ios/distribution-cert content="$(cat distribution.p12)"
```

**Option 2: SOPS (GitOps Secrets)**
```bash
# Encrypt secrets for git storage
sops --encrypt --pgp YOUR_PGP_KEY_ID secrets.yaml > secrets.enc.yaml

# Decrypt for use
sops --decrypt secrets.enc.yaml
```

**Option 3: 1Password/Bitwarden**
- Store in secure vault with 2FA
- Use CLI tools for automated access
- Emergency access sharing configured

## 🚨 Emergency Recovery Procedures

### Scenario 1: Certificate Expiry
**iOS Distribution Certificate** (expires annually):
1. **Detection**: Monitor expiry via `security/cert-expiry-check.sh`
2. **Renewal**: Generate new certificate in Apple Developer Portal
3. **Deployment**: Update GitHub Secrets with new certificate
4. **Validation**: Run CI/CD pipeline to confirm new cert works

**Android Keystore** (permanent - never expires):
1. **Backup**: Store securely in multiple encrypted locations
2. **Recovery**: If lost, create new keystore and update in Play Console
3. **Impact**: Requires Play Store app signing key reset

### Scenario 2: Compromised Keys
**Immediate Actions**:
1. **Revoke**: Disable compromised keys in respective portals
2. **Rotate**: Generate new keys and update all systems
3. **Audit**: Check for unauthorized access or deployments
4. **Communicate**: Notify team of security incident

**Recovery Steps**:
```bash
# 1. Revoke old keys
# Apple: Remove from App Store Connect → Users and Access
# Google: Delete service account in IAM & Admin

# 2. Generate new keys
# Follow certificate setup documentation

# 3. Update GitHub Secrets
gh secret set NEW_KEY_NAME -b"$(cat new-key-file | base64)"

# 4. Update CI/CD configuration
# Ensure all workflows use new secret names

# 5. Test deployment pipeline
# Run full build → upload cycle with new keys
```

### Scenario 3: Lost Access to Developer Accounts
**Apple Developer Account**:
1. **Recovery**: Use account recovery process (24-48 hours)
2. **Backup Access**: Set up multiple admin accounts
3. **Documentation**: Keep account recovery information secure

**Google Play Console**:
1. **Recovery**: Use Google account recovery (varies by account type)
2. **Backup Access**: Add multiple owners to Play Console
3. **Verification**: Phone number and email verification setup

## 🔄 Rotation Schedule

### Automated Rotation (GitHub Actions)
```yaml
# In .github/workflows/security.yml
name: Security Key Rotation
on:
  schedule:
    - cron: '0 0 1 * *'  # Monthly on 1st
  workflow_dispatch:

jobs:
  rotate-keys:
    runs-on: ubuntu-latest
    steps:
      - name: Check certificate expiry
        run: |
          # Check iOS cert expiry
          openssl pkcs12 -in cert.p12 -passin pass:${{ secrets.IOS_CERT_PASSWORD }} -noout -enddate
          # Check keystore validity
          keytool -list -keystore keystore.jks -storepass ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
```

### Manual Rotation Checklist
- [ ] **30 days before expiry**: Notify team of upcoming rotation
- [ ] **7 days before expiry**: Generate new certificates/keys
- [ ] **Rotation day**: Update GitHub Secrets and test deployment
- [ ] **Post-rotation**: Archive old keys securely for 7 years
- [ ] **Documentation**: Update this document with new key details

## 🛡️ Security Monitoring

### Key Access Monitoring
```bash
# GitHub API to monitor secret access
gh api repos/:owner/:repo/actions/secrets --include

# Audit log analysis
gh api repos/:owner/:repo/actions/runs --include
```

### Certificate Expiry Monitoring
```bash
#!/bin/bash
# security/cert-expiry-check.sh
echo "Checking certificate expiry dates..."

# iOS Certificate
echo "iOS Distribution Certificate:"
openssl pkcs12 -in <(echo "${IOS_CERT}" | base64 -d) -passin pass:"${IOS_CERT_PASSWORD}" -noout -enddate 2>/dev/null || echo "Certificate not accessible"

# Android Keystore (check creation date)
echo "Android Keystore:"
keytool -list -keystore <(echo "${ANDROID_KEYSTORE}" | base64 -d) -storepass "${ANDROID_KEYSTORE_PASSWORD}" 2>/dev/null | grep "Creation date" || echo "Keystore not accessible"
```

## 📋 Emergency Contacts

| Role | Contact | Responsibility |
|------|---------|---------------|
| **Security Lead** | security@plusultra.dev | Key rotation and incident response |
| **DevOps Lead** | devops@plusultra.dev | CI/CD and deployment coordination |
| **Apple Contact** | developer.apple.com | Apple Developer Program support |
| **Google Contact** | support.google.com/googleplay | Google Play Developer support |

## 🔗 External Documentation

- **Apple Developer**: https://developer.apple.com/support/certificates
- **Google Play**: https://support.google.com/googleplay/android-developer
- **GitHub Secrets**: https://docs.github.com/en/actions/security-guides/encrypted-secrets
- **HashiCorp Vault**: https://developer.hashicorp.com/vault/docs/secrets-management
- **SOPS**: https://github.com/getsops/sops
