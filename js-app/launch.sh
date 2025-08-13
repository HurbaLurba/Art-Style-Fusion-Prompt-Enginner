#!/bin/bash

# Art Style Fusion Prompt Engineer - Launch Script
echo "🎨 Starting Art Style Fusion Prompt Engineer..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the js-app directory"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating from template..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "📝 .env file created. Please edit it with your API keys before continuing."
    else
        echo "❌ No .env.example file found. Please create a .env file with your configuration."
        exit 1
    fi
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

# Ask user what they want to do
echo ""
echo "🚀 What would you like to do?"
echo "1) Start development server (with hot reload)"
echo "2) Build and start production server"
echo "3) Start with Docker"
echo "4) Run tests"
echo "5) Exit"
echo ""
read -p "Choose an option (1-5): " choice

case $choice in
    1)
        echo "🔥 Starting development server..."
        npm run dev
        ;;
    2)
        echo "🏗️  Building for production..."
        npm run build
        if [ $? -eq 0 ]; then
            echo "🚀 Starting production server..."
            npm start
        else
            echo "❌ Build failed"
            exit 1
        fi
        ;;
    3)
        if ! command -v docker &> /dev/null; then
            echo "❌ Docker is not installed. Please install Docker first."
            exit 1
        fi
        echo "🐳 Starting with Docker..."
        docker-compose up --build
        ;;
    4)
        echo "🧪 Running tests..."
        npm test
        ;;
    5)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid option. Please choose 1-5."
        exit 1
        ;;
esac
