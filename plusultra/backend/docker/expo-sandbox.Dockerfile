# Expo Sandbox Container
# Optimized specifically for Expo projects with web support
FROM node:20

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install global tools
RUN npm install -g \
    npm@latest \
    expo-cli \
    @expo/ngrok@^4.1.0

# Create app directory
WORKDIR /app

# Add non-root user
RUN groupadd -r expo && \
    useradd -r -g expo expo && \
    chown -R expo:expo /app

# Switch to non-root user
USER expo

# Expose Expo ports
# 19000: Expo dev server
# 19001: Expo dev server (redirects)
# 19002: Expo dev server (web)
# 19006: Expo web (webpack dev server)
EXPOSE 19000 19001 19002 19006

# Set environment variables
ENV EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0
ENV REACT_NATIVE_PACKAGER_HOSTNAME=0.0.0.0

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:19000 || exit 1

# Default command
CMD ["sh", "-c", "npm install && npx expo start --web"]
