#!/bin/bash

# Build Docker images for PlusUltra sandbox environments
# Usage: ./build-images.sh [--push] [--tag VERSION]

set -e

REGISTRY="plusultra"
VERSION="${TAG:-latest}"
PUSH=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --push)
      PUSH=true
      shift
      ;;
    --tag)
      VERSION="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "🐳 Building PlusUltra Sandbox Images (version: $VERSION)"
echo "=================================================="

# Build Next.js sandbox
echo ""
echo "📦 Building Next.js Sandbox..."
docker build \
  -f nextjs-sandbox.Dockerfile \
  -t ${REGISTRY}/nextjs-sandbox:${VERSION} \
  -t ${REGISTRY}/nextjs-sandbox:latest \
  .

echo "✅ Next.js sandbox built successfully"

# Build React Native sandbox
echo ""
echo "📦 Building React Native Sandbox..."
docker build \
  -f react-native-sandbox.Dockerfile \
  -t ${REGISTRY}/react-native-sandbox:${VERSION} \
  -t ${REGISTRY}/react-native-sandbox:latest \
  .

echo "✅ React Native sandbox built successfully"

# Build Expo sandbox
echo ""
echo "📦 Building Expo Sandbox..."
docker build \
  -f expo-sandbox.Dockerfile \
  -t ${REGISTRY}/expo-sandbox:${VERSION} \
  -t ${REGISTRY}/expo-sandbox:latest \
  .

echo "✅ Expo sandbox built successfully"

# List built images
echo ""
echo "📋 Built Images:"
docker images | grep ${REGISTRY}

# Push to registry if requested
if [ "$PUSH" = true ]; then
  echo ""
  echo "📤 Pushing images to registry..."

  docker push ${REGISTRY}/nextjs-sandbox:${VERSION}
  docker push ${REGISTRY}/nextjs-sandbox:latest

  docker push ${REGISTRY}/react-native-sandbox:${VERSION}
  docker push ${REGISTRY}/react-native-sandbox:latest

  docker push ${REGISTRY}/expo-sandbox:${VERSION}
  docker push ${REGISTRY}/expo-sandbox:latest

  echo "✅ All images pushed successfully"
fi

echo ""
echo "🎉 Done! Images are ready to use."
echo ""
echo "To test an image:"
echo "  docker run -it -p 3000:3000 ${REGISTRY}/nextjs-sandbox:latest"
