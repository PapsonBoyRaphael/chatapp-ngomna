#!/bin/bash

echo "🔨 Building Chat-Files-Service..."

# Clean previous build
rm -rf dist

# Install dependencies
npm ci

# Run linting
npm run lint

# Run tests
npm test

# Build application
npm run build

echo "✅ Build completed successfully!"
