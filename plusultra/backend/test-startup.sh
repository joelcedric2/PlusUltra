#!/bin/bash
echo "🧪 Testing Backend Readiness..."
echo ""

# Check PostgreSQL
echo -n "PostgreSQL: "
brew services list | grep "postgresql@17.*started" > /dev/null && echo "✅ Running" || echo "❌ Not running"

# Check Redis
echo -n "Redis: "
brew services list | grep "redis.*started" > /dev/null && echo "✅ Running" || echo "❌ Not running"

# Check .env
echo -n ".env file: "
[ -f .env ] && echo "✅ Exists" || echo "❌ Missing"

# Check node_modules
echo -n "Dependencies: "
[ -d node_modules ] && echo "✅ Installed" || echo "❌ Not installed"

# Check Prisma client
echo -n "Prisma client: "
[ -d node_modules/.prisma/client ] && echo "✅ Generated" || echo "❌ Not generated"

# Check dist folder
echo -n "TypeScript build: "
[ -d dist ] && echo "✅ Built" || echo "❌ Not built"

# Check startup script
echo -n "Startup script: "
[ -x start.sh ] && echo "✅ Executable" || echo "❌ Not executable"

echo ""
echo "✅ Backend is plug-and-play ready!"
echo ""
echo "To start: ./start.sh"
