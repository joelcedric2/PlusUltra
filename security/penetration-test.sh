#!/bin/bash
# security/penetration-test.sh
# Automated security scanning and vulnerability assessment

set -e

echo "🔒 Starting comprehensive security scan..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 1. Dependency Vulnerability Scanning
print_status "Running dependency vulnerability scan..."
if command -v npm >/dev/null 2>&1; then
    cd /Users/joelc/Documents/Github/PlusUltra

    # Frontend vulnerabilities
    if [[ -f plusultra/frontend/package.json ]]; then
        print_status "Scanning frontend dependencies..."
        cd plusultra/frontend
        npm audit --audit-level high || print_warning "High severity vulnerabilities found in frontend"
        cd ../..
    fi

    # Backend vulnerabilities
    if [[ -f plusultra/backend/package.json ]]; then
        print_status "Scanning backend dependencies..."
        cd plusultra/backend
        npm audit --audit-level high || print_warning "High severity vulnerabilities found in backend"
        cd ../..
    fi
else
    print_warning "npm not available for vulnerability scanning"
fi

# 2. Static Security Analysis
print_status "Running static security analysis..."

# Check for hardcoded secrets
print_status "Checking for hardcoded secrets..."
if grep -r "sk-" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" plusultra/ 2>/dev/null | grep -v node_modules; then
    print_error "Hardcoded secrets detected!"
    exit 1
fi

# Check for certificate files in git
print_status "Checking for certificate files in git..."
if git ls-files | grep -E "\.(p12|p8|keystore|jks)$" >/dev/null 2>&1; then
    print_error "Certificate files found in git repository!"
    exit 1
fi

# Check .gitignore effectiveness
print_status "Validating .gitignore effectiveness..."
if [[ -f .gitignore ]]; then
    # Check if certificate patterns are properly ignored
    if ! grep -E "\.(p12|p8|keystore|jks)$" .gitignore >/dev/null; then
        print_warning "Certificate file patterns not found in .gitignore"
    fi

    # Check if .env files are ignored
    if ! grep "\.env" .gitignore >/dev/null; then
        print_warning ".env files not properly ignored"
    fi
fi

# 3. OWASP Security Headers Check
print_status "Checking security headers configuration..."

# Check if helmet is properly configured in backend
if [[ -f plusultra/backend/src/server.ts ]]; then
    if ! grep -A 5 -B 5 "helmet" plusultra/backend/src/server.ts >/dev/null; then
        print_warning "Security headers (helmet) may not be properly configured"
    fi
fi

# 4. API Security Validation
print_status "Validating API security configuration..."

# Check for proper CORS configuration
if [[ -f plusultra/backend/src/server.ts ]]; then
    if ! grep -i "cors\|helmet\|rate" plusultra/backend/src/server.ts >/dev/null; then
        print_warning "Security middleware (CORS, rate limiting, helmet) may not be configured"
    fi
fi

# 5. Environment Variables Security
print_status "Checking environment variable security..."

# Check if .env files exist (should be gitignored)
if ls .env* 1>/dev/null 2>&1; then
    print_warning "Environment files found in repository root"
fi

# Check backend .env configuration
if [[ -f plusultra/backend/.env.example ]]; then
    print_status "Environment configuration template found"
fi

# 6. Certificate and Key Security
print_status "Validating certificate security..."

# Check if security documentation exists
if [[ ! -f security/certificates-setup.md ]]; then
    print_warning "Certificate setup documentation not found"
fi

if [[ ! -f security/keystore-ops.md ]]; then
    print_warning "Key operations documentation not found"
fi

# 7. Container Security (if applicable)
print_status "Checking container security..."

if [[ -f Dockerfile ]] || [[ -f docker-compose.yml ]]; then
    print_status "Container files found - validate security settings"
    # Check for proper user configuration
    if [[ -f Dockerfile ]]; then
        if ! grep -i "USER\|RUN.*user" Dockerfile >/dev/null; then
            print_warning "Container may not have proper user isolation"
        fi
    fi
fi

# 8. Generate Security Report
print_status "Generating security report..."

REPORT_FILE="security/audit-report-$(date +%Y%m%d-%H%M%S).md"
mkdir -p security

cat > "$REPORT_FILE" << EOF
# 🔒 PlusUltra Security Audit Report
**Generated**: $(date)
**Scope**: Automated security scanning and vulnerability assessment

## 📊 Scan Results

### ✅ Dependency Vulnerabilities
- Frontend: $(cd plusultra/frontend && npm audit --audit-level high --json 2>/dev/null | jq '.vulnerabilities | length' || echo "N/A")
- Backend: $(cd plusultra/backend && npm audit --audit-level high --json 2>/dev/null | jq '.vulnerabilities | length' || echo "N/A")

### ✅ Static Security Analysis
- Hardcoded secrets: $(if grep -r "sk-" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" plusultra/ 2>/dev/null | grep -v node_modules | wc -l; then echo "❌ FOUND"; else echo "✅ CLEAN"; fi)
- Certificate files in git: $(if git ls-files | grep -E "\.(p12|p8|keystore|jks)$" >/dev/null 2>&1; then echo "❌ FOUND"; else echo "✅ CLEAN"; fi)
- .gitignore effectiveness: $(if [[ -f .gitignore ]] && grep -E "\.(p12|p8|keystore|jks)$" .gitignore >/dev/null; then echo "✅ CONFIGURED"; else echo "⚠️ MISSING"; fi)

### ✅ Security Headers
- Helmet configuration: $(if [[ -f plusultra/backend/src/server.ts ]] && grep -A 5 -B 5 "helmet" plusultra/backend/src/server.ts >/dev/null; then echo "✅ CONFIGURED"; else echo "⚠️ MISSING"; fi)

### ✅ API Security
- Security middleware: $(if [[ -f plusultra/backend/src/server.ts ]] && grep -i "cors\|helmet\|rate" plusultra/backend/src/server.ts >/dev/null; then echo "✅ CONFIGURED"; else echo "⚠️ MISSING"; fi)

## 🚨 Security Recommendations

EOF

# Add recommendations based on scan results
if [[ ! -f security/certificates-setup.md ]]; then
    echo "- ❌ **CRITICAL**: Certificate setup documentation missing" >> "$REPORT_FILE"
fi

if [[ ! -f .gitignore ]] || ! grep -E "\.(p12|p8|keystore|jks)$" .gitignore >/dev/null; then
    echo "- ❌ **CRITICAL**: Certificate files not properly excluded from git" >> "$REPORT_FILE"
fi

if grep -r "sk-" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" plusultra/ 2>/dev/null | grep -v node_modules; then
    echo "- ❌ **CRITICAL**: Hardcoded secrets detected in codebase" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"
echo "## 📋 Next Steps" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "1. **Review and remediate** any critical security findings above" >> "$REPORT_FILE"
echo "2. **Run manual penetration testing** before production deployment" >> "$REPORT_FILE"
echo "3. **Implement security monitoring** for production environments" >> "$REPORT_FILE"
echo "4. **Schedule regular security audits** (quarterly recommended)" >> "$REPORT_FILE"

print_status "Security scan completed. Report saved to: $REPORT_FILE"

# Exit with error if critical issues found
CRITICAL_ISSUES=$(grep -c "❌ \*\*CRITICAL\*\*" "$REPORT_FILE" || echo "0")
if [[ $CRITICAL_ISSUES -gt 0 ]]; then
    print_error "Critical security issues found! Review report and remediate before deployment."
    exit 1
else
    print_status "No critical security issues found. Ready for next security phase."
fi
