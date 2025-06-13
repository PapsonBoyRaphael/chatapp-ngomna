#!/bin/bash

echo "🧪 Running tests for Chat-Files-Service..."

# Set test environment
export NODE_ENV=test

# Run unit tests
echo "📋 Running unit tests..."
npm run test -- tests/unit/

# Run integration tests
echo "🔗 Running integration tests..."
npm run test -- tests/integration/

# Run e2e tests
echo "🎯 Running e2e tests..."
npm run test:e2e

# Generate coverage report
echo "📊 Generating coverage report..."
npm run test:coverage

echo "✅ All tests completed!"
