# Installation Guide

This guide will help you set up the Art Style Fusion Prompt Engineer JavaScript application.

## Prerequisites

### 1. Install Node.js

**Windows:**
1. Visit [nodejs.org](https://nodejs.org/)
2. Download the LTS version (20.x or higher recommended)
3. Run the installer and follow the setup wizard
4. Restart your terminal/command prompt after installation

**macOS:**
```bash
# Using Homebrew (recommended)
brew install node

# Or download from nodejs.org
```

**Linux (Ubuntu/Debian):**
```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 2. Install Docker (Optional)

**Windows:**
1. Download Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop)
2. Install and restart your computer
3. Start Docker Desktop

**macOS:**
```bash
# Using Homebrew
brew install --cask docker

# Or download Docker Desktop from docker.com
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker.io docker-compose
sudo systemctl enable docker
sudo systemctl start docker

# Add user to docker group (logout and login after this)
sudo usermod -aG docker $USER
```

### 3. Get API Keys

You need at least one AI provider API key:

**OpenAI (Recommended):**
1. Visit [platform.openai.com](https://platform.openai.com)
2. Create an account and navigate to API Keys
3. Create a new API key
4. Copy the key (starts with `sk-`)

**OpenRouter (Alternative):**
1. Visit [openrouter.ai](https://openrouter.ai)
2. Sign up for an account
3. Get your API key from the dashboard
4. Copy the key

**Ollama (Local AI - Optional):**
1. Visit [ollama.com](https://ollama.com)
2. Download and install Ollama
3. Run: `ollama pull llama3.2-vision`
4. The server runs on `http://localhost:11434`

## Setup Instructions

### Method 1: Using the Launcher (Easiest)

1. **Navigate to the project directory:**
   ```bash
   cd js-app
   ```

2. **Run the launcher:**
   - **Windows**: Double-click `launch.bat`
   - **macOS/Linux**: 
     ```bash
     chmod +x launch.sh
     ./launch.sh
     ```

3. **Follow the interactive prompts**

### Method 2: Manual Setup

1. **Navigate to the js-app directory:**
   ```bash
   cd js-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

4. **Edit the .env file with your API keys:**
   ```env
   OPENAI_API_KEY=your_actual_openai_key_here
   OPENROUTER_API_KEY=your_actual_openrouter_key_here
   ```

5. **Start the application:**
   ```bash
   # Development mode (with hot reload)
   npm run dev
   
   # Production mode
   npm run build
   npm start
   ```

### Method 3: Using Docker

1. **Navigate to the js-app directory:**
   ```bash
   cd js-app
   ```

2. **Create and configure .env file:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start with Docker:**
   ```bash
   docker-compose up --build
   ```

## Verification

After setup, you should be able to:

1. **Access the application:**
   - Development: http://localhost:3000 (frontend) + http://localhost:8000 (API)
   - Production: http://localhost:8000

2. **Test functionality:**
   - Upload an image
   - Select an art style
   - Generate descriptions and prompts

## Troubleshooting

### Common Issues

**"npm: command not found"**
- Node.js is not installed or not in PATH
- Restart terminal after Node.js installation
- On Windows, restart Command Prompt or PowerShell

**"Port already in use"**
- Change PORT in .env file to a different number
- Kill existing processes using the port

**"API Key invalid"**
- Check that API keys are correctly set in .env
- Ensure no extra spaces or quotes around keys
- Verify API key is active and has credits

**Docker issues:**
- Ensure Docker is running
- Check Docker has enough memory allocated
- Try: `docker-compose down && docker-compose up --build`

### Getting Help

1. **Check logs:**
   ```bash
   # Application logs
   npm run server
   
   # Docker logs
   docker-compose logs -f
   ```

2. **Common fixes:**
   ```bash
   # Clear node modules and reinstall
   rm -rf node_modules package-lock.json
   npm install
   
   # Clear Docker cache
   docker-compose down
   docker system prune -a
   docker-compose up --build
   ```

3. **Environment validation:**
   ```bash
   # Check Node.js version (should be 18+)
   node --version
   
   # Check npm version
   npm --version
   
   # Check if ports are available
   netstat -tulpn | grep :8000
   ```

## Next Steps

After successful installation:

1. **Configure your AI providers** in the .env file
2. **Test the application** with a sample image
3. **Customize the prompts** by editing the BASE_*_PROMPT variables
4. **Read the main README** for usage instructions

## Support

If you encounter issues:
1. Check this troubleshooting guide
2. Verify all prerequisites are installed
3. Check the GitHub issues page
4. Create a new issue with error details

Happy prompting! 🎨
