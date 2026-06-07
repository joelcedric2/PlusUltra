#!/bin/bash

# PlusUltra TCI System - Production Setup Script
# This script automates the setup of the TCI system for production use

set -e  # Exit on error

echo "🚀 PlusUltra TCI System - Production Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to backend directory
cd "$(dirname "$0")/../plusultra/backend"

echo "📂 Current directory: $(pwd)"
echo ""

# Step 1: Check Node.js version
echo "1️⃣  Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 18+ required. Current version: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js version: $(node -v)${NC}"
echo ""

# Step 2: Check if .env exists
echo "2️⃣  Checking environment configuration..."
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env and add your API keys before continuing!${NC}"
    echo -e "${YELLOW}   Required keys:${NC}"
    echo -e "${YELLOW}   - OPENAI_API_KEY${NC}"
    echo -e "${YELLOW}   - ANTHROPIC_API_KEY${NC}"
    echo -e "${YELLOW}   - GOOGLE_AI_API_KEY${NC}"
    echo -e "${YELLOW}   - PINECONE_API_KEY${NC}"
    echo -e "${YELLOW}   - NEO4J_PASSWORD${NC}"
    echo -e "${YELLOW}   - DATABASE_URL${NC}"
    echo ""
    read -p "Press enter after you've added your API keys to .env..."
else
    echo -e "${GREEN}✓ .env file found${NC}"
fi
echo ""

# Step 3: Install dependencies
echo "3️⃣  Installing dependencies..."
if npm install; then
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi
echo ""

# Step 4: Run database migrations
echo "4️⃣  Running database migrations..."
if npm run db:generate && npm run db:migrate:deploy; then
    echo -e "${GREEN}✓ Database migrations completed${NC}"
else
    echo -e "${YELLOW}⚠️  Database migrations failed (this is OK if DB not yet configured)${NC}"
fi
echo ""

# Step 5: Build TypeScript
echo "5️⃣  Building TypeScript..."
if npm run build; then
    echo -e "${GREEN}✓ TypeScript build successful${NC}"
else
    echo -e "${RED}❌ TypeScript build failed${NC}"
    exit 1
fi
echo ""

# Step 6: Run tests
echo "6️⃣  Running tests..."
if npm run test; then
    echo -e "${GREEN}✓ Tests passed${NC}"
else
    echo -e "${YELLOW}⚠️  Some tests failed (review output above)${NC}"
fi
echo ""

# Step 7: Summary
echo "=========================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Start required services:"
echo "   - PostgreSQL: Ensure DATABASE_URL is correct in .env"
echo "   - Redis: docker run -p 6379:6379 redis:latest"
echo "   - Neo4j: docker run -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest"
echo ""
echo "2. Start the server:"
echo "   npm run dev    # Development"
echo "   npm start      # Production"
echo ""
echo "3. Verify TCI system:"
echo "   npx ts-node scripts/verify-tci.ts"
echo ""
echo "4. Generate a test compliance report:"
echo "   npx ts-node scripts/generate-test-report.ts"
echo ""
echo "📚 Documentation:"
echo "   - Production deployment: ../PRODUCTION_DEPLOYMENT.md"
echo "   - TCI summary: ../TCI_PRODUCTION_READY_SUMMARY.md"
echo ""
echo "🎉 Your TCI system is ready to go!"
echo ""
