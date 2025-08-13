# Art Style Fusion - Docker Deployment Script for Windows
param(
    [switch]$SkipBrowser
)

Write-Host "🎨 Art Style Fusion Prompt Engineer - Docker Deployment" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# Check if Docker is running
try {
    docker info | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Check if .env exists
if (-Not (Test-Path ".env")) {
    Write-Host "⚠️  No .env file found. Creating from template..." -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "📝 .env file created from template." -ForegroundColor Green
        Write-Host "⚠️  Please edit .env with your API keys before continuing." -ForegroundColor Yellow
        Write-Host "   You need at least one of: OPENAI_API_KEY or OPENROUTER_API_KEY" -ForegroundColor Yellow
        Read-Host "Press Enter after configuring .env file"
    } else {
        Write-Host "❌ No .env.example found. Please create a .env file manually." -ForegroundColor Red
        exit 1
    }
}

# Validate API keys
$envContent = Get-Content ".env" -Raw
if (-Not ($envContent -match "OPENAI_API_KEY=sk-" -or $envContent -match "OPENROUTER_API_KEY=(?!your_)")) {
    Write-Host "⚠️  Warning: No valid API keys detected in .env file." -ForegroundColor Yellow
    Write-Host "   Make sure to set OPENAI_API_KEY or OPENROUTER_API_KEY" -ForegroundColor Yellow
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
}

Write-Host "🐳 Starting deployment..." -ForegroundColor Blue

# Stop any existing containers
Write-Host "🛑 Stopping existing containers..." -ForegroundColor Yellow
docker-compose down --remove-orphans 2>$null

# Build and start
Write-Host "🏗️  Building and starting containers..." -ForegroundColor Blue
docker-compose up --build -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed. Check the output above." -ForegroundColor Red
    exit 1
}

# Wait for health check
Write-Host "⏳ Waiting for application to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Check if container is running
$status = docker-compose ps --format json | ConvertFrom-Json
$running = $status | Where-Object { $_.State -eq "running" }

if ($running) {
    Write-Host "✅ Application is running!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Access your application at: " -NoNewline -ForegroundColor Cyan
    Write-Host "http://localhost:8000" -ForegroundColor White
    Write-Host "📊 Check status: " -NoNewline -ForegroundColor Cyan
    Write-Host "docker-compose ps" -ForegroundColor White
    Write-Host "📋 View logs: " -NoNewline -ForegroundColor Cyan  
    Write-Host "docker-compose logs -f" -ForegroundColor White
    Write-Host "🛑 Stop application: " -NoNewline -ForegroundColor Cyan
    Write-Host "docker-compose down" -ForegroundColor White
    Write-Host ""
    
    # Open browser (optional)
    if (-Not $SkipBrowser) {
        $openBrowser = Read-Host "Open browser? (y/N)"
        if ($openBrowser -eq "y" -or $openBrowser -eq "Y") {
            Start-Process "http://localhost:8000"
        }
    }
} else {
    Write-Host "❌ Deployment failed. Check logs:" -ForegroundColor Red
    docker-compose logs
    exit 1
}
