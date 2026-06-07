# React Native / Expo Sandbox Container
# Supports both React Native CLI and Expo
FROM node:20

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    watchman \
    && rm -rf /var/lib/apt/lists/*

# Install global tools
RUN npm install -g \
    npm@latest \
    expo-cli \
    react-native-cli \
    @react-native-community/cli

# Create app directory
WORKDIR /app

# Add non-root user
RUN groupadd -r reactnative && \
    useradd -r -g reactnative reactnative && \
    chown -R reactnative:reactnative /app

# Switch to non-root user
USER reactnative

# Expose ports
# 8081: React Native Metro Bundler
# 19000: Expo dev server
# 19001: Expo dev server (redirects)
# 19002: Expo dev server (web)
EXPOSE 8081 19000 19001 19002

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8081/status || curl -f http://localhost:19000 || exit 1

# Default command
CMD ["sh", "-c", "npm install && npm start"]
