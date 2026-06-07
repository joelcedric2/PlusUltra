# Next.js Sandbox Container
# Optimized for fast startup and hot reload
FROM node:20-alpine

# Install dependencies for better performance
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++

# Create app directory
WORKDIR /app

# Install global dependencies
RUN npm install -g npm@latest

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy package files
# Note: These will be mounted from host, but we set up the structure
RUN mkdir -p /app/node_modules && \
    chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose Next.js dev server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Default command (can be overridden)
CMD ["sh", "-c", "npm install && npm run dev"]
