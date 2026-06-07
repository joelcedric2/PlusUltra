# 🔐 Mobile App Certificates & Signing Setup

## Overview
This document outlines the certificate and key setup required for iOS and Android app deployment through EAS Build and Fastlane.

## ⚠️ Security Requirements

**CRITICAL**: Never commit certificate files, keys, or secrets to Git. All certificates must be stored as GitHub Secrets or secure vault.

## 📱 iOS Certificates Required

### 1. Apple Developer Program
- **Requirement**: Apple Developer Program membership ($99/year)
- **Account**: developer.apple.com

### 2. App Store Connect API Key
- **File**: `.p8` file (private key)
- **Location**: Download from App Store Connect → Users and Access → Keys
- **GitHub Secret**: `APP_STORE_CONNECT_PRIVATE_KEY`
- **Environment Variable**: Contents of the `.p8` file as base64

### 3. iOS Distribution Certificate
- **File**: `.p12` or `.cer` (distribution certificate)
- **Purpose**: Code signing for App Store distribution
- **GitHub Secret**: `IOS_DISTRIBUTION_CERT`
- **Password**: `IOS_CERT_PASSWORD`

### 4. Provisioning Profile
- **File**: `.mobileprovision` (distribution profile)
- **Purpose**: App ID and certificate linking
- **GitHub Secret**: `IOS_PROVISIONING_PROFILE`

## 🤖 Android Certificates Required

### 1. Google Play Developer Account
- **Requirement**: Google Play Developer Console ($25 one-time)
- **Account**: play.google.com/console

### 2. Service Account Key (JSON)
- **File**: `service-account.json` (Google Cloud service account)
- **Location**: Google Cloud Console → IAM & Admin → Service Accounts
- **Permissions**: Editor role on Google Play Developer API
- **GitHub Secret**: `GOOGLE_PLAY_JSON_KEY`

### 3. Android Keystore
- **File**: `.keystore` or `.jks` (Java keystore)
- **Purpose**: App signing key
- **GitHub Secret**: `ANDROID_KEYSTORE`
- **Password**: `ANDROID_KEYSTORE_PASSWORD`
- **Alias**: `ANDROID_KEY_ALIAS`
- **Alias Password**: `ANDROID_KEY_PASSWORD`

## 🔧 Setup Instructions

### Step 1: Create GitHub Secrets
```bash
# iOS Secrets
gh secret set APP_STORE_CONNECT_PRIVATE_KEY -b"$(cat AuthKey_XXXXXXXXXX.p8 | base64)"
gh secret set IOS_DISTRIBUTION_CERT -b"$(cat distribution.p12 | base64)"
gh secret set IOS_CERT_PASSWORD -b"your_cert_password"
gh secret set IOS_PROVISIONING_PROFILE -b"$(cat distribution.mobileprovision | base64)"

# Android Secrets
gh secret set GOOGLE_PLAY_JSON_KEY -b"$(cat service-account.json | base64)"
gh secret set ANDROID_KEYSTORE -b"$(cat release.keystore | base64)"
gh secret set ANDROID_KEYSTORE_PASSWORD -b"your_keystore_password"
gh secret set ANDROID_KEY_ALIAS -b"your_key_alias"
gh secret set ANDROID_KEY_PASSWORD -b"your_key_password"
```

### Step 2: Update Fastfile with App IDs
```ruby
# In mobile/Fastfile
platform :ios do
  lane :upload_to_testflight do
    upload_to_testflight(
      app_identifier: "com.plusultra.app", # Your App Store Connect App ID
      username: ENV["APPLE_ID"],
      team_id: ENV["APPLE_TEAM_ID"],
      # ... other config
    )
  end
end

platform :android do
  lane :supply do
    upload_to_play_store(
      package_name: "com.plusultra.app", # Your Google Play package name
      json_key: ENV["GOOGLE_PLAY_JSON_KEY"],
      # ... other config
    )
  end
end
```

### Step 3: Verify Certificate Setup
```bash
# Test iOS certificate
openssl pkcs12 -info -in distribution.p12 -passin pass:your_password

# Test Android keystore
keytool -list -keystore release.keystore -storepass your_password -alias your_alias
```

## 🚨 Emergency Recovery

### If Certificates Are Lost:
1. **iOS**: Generate new certificate in Apple Developer Portal → Download → Upload to GitHub Secrets
2. **Android**: Generate new keystore → Update app signing in Google Play Console → Update GitHub Secrets

### Certificate Expiry:
- **iOS Distribution Cert**: Valid for 1 year, auto-renew in GitHub Actions
- **Android Keystore**: Valid indefinitely (keep secure backup)

## 📋 Verification Checklist

- [ ] Apple App Store Connect API key downloaded and tested
- [ ] iOS distribution certificate created and uploaded to GitHub Secrets
- [ ] iOS provisioning profile matches certificate and App ID
- [ ] Google Play service account created with proper permissions
- [ ] Android keystore generated with secure passwords
- [ ] All secrets uploaded to GitHub repository settings
- [ ] Fastfile configured with correct app identifiers
- [ ] Certificate files NOT present in git repository

## 🔗 Useful Links

- **Apple Developer**: https://developer.apple.com
- **App Store Connect**: https://appstoreconnect.apple.com
- **Google Play Console**: https://play.google.com/console
- **EAS Build Docs**: https://docs.expo.dev/build/introduction
- **Fastlane Docs**: https://docs.fastlane.tools
