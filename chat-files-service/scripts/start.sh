#!/bin/bash

echo "🚀 Starting Chat-Files-Service..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "📋 Creating .env from .env.example..."
    cp .env.example .env
fi

# Create required directories
echo "📁 Creating required directories..."
mkdir -p logs temp/uploads temp/processing temp/thumbnails

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the service
echo "🎯 Starting service in development mode..."
npm run dev
