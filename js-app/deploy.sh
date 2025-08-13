#!/bin/bash

# Art Style Fusion - Docker Deployment Script
set -e

echo "🎨 Art Style Fusion Prompt Engineer - Docker Deployment"
echo "======================================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating from template..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "📝 .env file created from template."
        echo "⚠️  Please edit .env with your API keys before continuing."
        echo "   You need at least one of: OPENAI_API_KEY or OPENROUTER_API_KEY"
        read -p "Press Enter after configuring .env file..."
    else
        echo "❌ No .env.example found. Please create a .env file manually."
        exit 1
    fi
fi

# Validate that at least one API key is set
if ! grep -q "OPENAI_API_KEY=sk-" .env && ! grep -q "OPENROUTER_API_KEY=" .env | grep -v "your_"; then
    echo "⚠️  Warning: No valid API keys detected in .env file."
    echo "   Make sure to set OPENAI_API_KEY or OPENROUTER_API_KEY"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "🐳 Starting deployment..."

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker-compose down --remove-orphans 2>/dev/null || true

# Build and start
echo "🏗️  Building and starting containers..."
docker-compose up --build -d

# Wait for health check
echo "⏳ Waiting for application to be ready..."
sleep 10

# Check if container is running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Application is running!"
    echo ""
    echo "🌐 Access your application at: http://localhost:8000"
    echo "📊 Check status: docker-compose ps"
    echo "📋 View logs: docker-compose logs -f"
    echo "🛑 Stop application: docker-compose down"
    echo ""
    
    # Open browser (optional)
    read -p "Open browser? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if command -v xdg-open > /dev/null; then
            xdg-open http://localhost:8000
        elif command -v open > /dev/null; then
            open http://localhost:8000
        else
            echo "Please open http://localhost:8000 manually"
        fi
    fi
else
    echo "❌ Deployment failed. Check logs:"
    docker-compose logs
    exit 1
fi
