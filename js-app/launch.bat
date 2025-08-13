@echo off
title Art Style Fusion Prompt Engineer - Launcher

echo.
echo 🎨 Art Style Fusion Prompt Engineer - Launcher
echo ===============================================

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18 or higher.
    echo    Download from: https://nodejs.org/
    pause
    exit /b 1
)

:: Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Please run this script from the js-app directory
    pause
    exit /b 1
)

:: Check if .env file exists
if not exist ".env" (
    echo ⚠️  No .env file found. Creating from template...
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo 📝 .env file created. Please edit it with your API keys before continuing.
    ) else (
        echo ❌ No .env.example file found. Please create a .env file with your configuration.
        pause
        exit /b 1
    )
)

:: Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
)

:menu
echo.
echo 🚀 What would you like to do?
echo 1) Start development server (with hot reload)
echo 2) Build and start production server
echo 3) Start with Docker
echo 4) Open in browser
echo 5) Exit
echo.
set /p choice="Choose an option (1-5): "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto prod
if "%choice%"=="3" goto docker
if "%choice%"=="4" goto browser
if "%choice%"=="5" goto exit
echo ❌ Invalid option. Please choose 1-5.
goto menu

:dev
echo 🔥 Starting development server...
call npm run dev
goto end

:prod
echo 🏗️  Building for production...
call npm run build
if %errorlevel% equ 0 (
    echo 🚀 Starting production server...
    call npm start
) else (
    echo ❌ Build failed
    pause
)
goto end

:docker
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker first.
    pause
    goto end
)
echo 🐳 Starting with Docker...
docker-compose up --build
goto end

:browser
echo 🌐 Opening application in browser...
start http://localhost:8000
goto menu

:exit
echo 👋 Goodbye!
goto end

:end
pause
