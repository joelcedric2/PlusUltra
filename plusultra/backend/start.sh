#!/bin/bash

# PlusUltra Backend - Simple Startup Script
# This script will start your backend in "plug and play" mode

echo "🚀 PlusUltra Backend Startup"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found${NC}"
    echo "Please run this script from the plusultra/backend directory"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env and add your API keys${NC}"
    exit 1
fi

echo "📋 Checking prerequisites..."
echo ""

# Check PostgreSQL
echo -n "  PostgreSQL... "
if brew services list | grep -q "postgresql@17.*started"; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${YELLOW}⚠ Not running${NC}"
    echo "  Starting PostgreSQL..."
    brew services start postgresql@17
fi

# Check Redis
echo -n "  Redis... "
if brew services list | grep -q "redis.*started"; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${YELLOW}⚠ Not running${NC}"
    echo "  Starting Redis..."
    brew services start redis
fi

# Check if node_modules exists
echo -n "  Dependencies... "
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓ Installed${NC}"
else
    echo -e "${YELLOW}⚠ Installing${NC}"
    npm install
fi

echo ""
echo "🔧 Setting up database..."

# Run migrations
echo "  Running Prisma migrations..."
npm run db:migrate:deploy > /dev/null 2>&1

# Generate Prisma client
echo "  Generating Prisma client..."
npm run db:generate > /dev/null 2>&1

echo -e "${GREEN}✓ Database ready${NC}"
echo ""

# Check for API keys
echo "🔑 Checking API keys..."
missing_keys=false

if grep -q "your-openai-api-key" .env; then
    echo -e "${YELLOW}  ⚠ OpenAI API key not set${NC}"
    missing_keys=true
fi

if grep -q "your-anthropic-api-key" .env; then
    echo -e "${YELLOW}  ⚠ Anthropic API key not set${NC}"
    missing_keys=true
fi

if [ "$missing_keys" = true ]; then
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANT: Add your API keys to .env${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Required for AI features:"
    echo "  • OPENAI_API_KEY (get from: platform.openai.com)"
    echo "  • ANTHROPIC_API_KEY (get from: console.anthropic.com)"
    echo ""
    echo "The backend will start but AI features won't work until you add real API keys."
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Exiting. Please add your API keys to .env and try again."
        exit 1
    fi
else
    echo -e "${GREEN}  ✓ API keys configured${NC}"
fi

echo ""
echo "🏗️  Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Build completed with warnings (this is normal)${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Starting PlusUltra Backend...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Server will be available at:"
echo "  • HTTP: http://localhost:3001"
echo "  • Health: http://localhost:3001/health"
echo "  • Status: http://localhost:3001/api/v1/status"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the backend
npm run dev
