# Art Style Fusion Prompt Engineer

A powerful, containerized AI application for creating rich, detailed prompts by combining art styles, image descriptions, and artist inspirations. Transform your images and ideas into stunning AI-ready prompts for text-to-image generators.

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose installed
- API key from OpenAI or OpenRouter

### Deploy in 3 Steps

1. **Clone & Setup**
```bash
git clone https://github.com/ergonomech/Art-Style-Fusion-Prompt-Enginner.git
cd Art-Style-Fusion-Prompt-Enginner/js-app
cp .env.example .env
```

2. **Configure API Keys**
Edit `.env` file:
```env
OPENAI_API_KEY=sk-your_actual_key_here
# OR  
OPENROUTER_API_KEY=your_openrouter_key_here
```

3. **Deploy**
```bash
docker-compose up --build -d
```

4. **Access**
Open http://localhost:8000 🎨

## 🎯 Features

- **Image Analysis**: Upload and analyze images using AI vision models
- **Art Style Selection**: Choose from various artistic movements and styles
- **Artist Recommendations**: Get personalized artist suggestions
- **Custom Inputs**: Add your own creative elements and requirements
- **Prompt Generation**: Generate comprehensive, AI-ready prompts
- **Export Options**: Copy to clipboard or download as text file
- **Multiple AI Providers**: Support for OpenAI, OpenRouter, and Ollama
- **Modern UI**: Responsive design that works on all devices

## 📁 Project Structure

```text
Art-Style-Fusion-Prompt-Enginner/
├── js-app/                          # Main Application
│   ├── public/                      # Frontend (HTML/CSS/JS)
│   ├── server/                      # Backend API (Express.js)
│   ├── Dockerfile                   # Container definition
│   ├── docker-compose.yml          # Container orchestration
│   └── .env.example                # Environment template
├── README.md                        # This file
└── LICENSE                          # MIT License
```

## 🔧 Configuration

### API Keys Setup

**OpenAI (Recommended)**
1. Visit https://platform.openai.com/api-keys
2. Create API key (starts with `sk-`)
3. Add to `.env`: `OPENAI_API_KEY=sk-your_key`

**OpenRouter (Alternative)**
1. Visit https://openrouter.ai/
2. Get API key from dashboard  
3. Add to `.env`: `OPENROUTER_API_KEY=your_key`

**Ollama (Local AI - Optional)**
1. Install Ollama locally
2. Run: `ollama pull llama3.2-vision`
3. Configure in `.env`: `OLLAMA_SERVER_URL=http://host.docker.internal:11434`

### Environment Variables
The `.env.example` file contains all configurable options:
- API endpoints and keys
- Base prompts for different AI tasks
- Server configuration

## 🐳 Docker Commands

```bash
# Start application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop application
docker-compose down

# Rebuild and restart
docker-compose up --build -d

# Check status
docker-compose ps
```

## 🎨 How to Use

1. **Upload Image**: Drag & drop or select an image file
2. **Choose Art Style**: Select from various artistic movements
3. **Analyze**: AI analyzes your image and generates descriptions
4. **Generate**: Create artist recommendations and style descriptions
5. **Customize**: Add your own creative elements in the custom input field
6. **Export**: Copy final prompt to clipboard or download as text file

## 🛠️ Development

To modify the application:

1. Edit source code in `js-app/`
2. Rebuild container: `docker-compose up --build -d`
3. View changes at http://localhost:8000

### Architecture
- **Frontend**: Vanilla JavaScript with modern CSS
- **Backend**: Express.js REST API
- **Container**: Multi-stage Docker build with security hardening
- **AI Integration**: Support for multiple AI providers

## 🔒 Security Features

- **Container Security**: Non-root user, read-only filesystem
- **API Protection**: Rate limiting and input validation
- **Environment Isolation**: Secure environment variable handling
- **Health Checks**: Container monitoring and auto-restart
- **File Validation**: Safe image upload with size and type limits

## 🚨 Troubleshooting

**Container Issues**
```bash
# Check container status
docker-compose ps

# View detailed logs
docker-compose logs -f

# Clean restart
docker-compose down
docker-compose up --build -d
```

**API Issues**
- Verify API keys in `.env` file (no extra spaces around keys)
- Check API key has sufficient credits
- Ensure at least one AI provider is configured

**Port Conflicts**
- Change port in `docker-compose.yml` if 8000 is in use
- Use `docker-compose down` to stop conflicting containers

## 🤝 Contributing

1. Fork the repository
2. Make changes to the application code in `js-app/`
3. Test with: `docker-compose up --build`
4. Submit pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

---

**Ready to create amazing AI prompts?**

```bash
cd js-app && docker-compose up --build -d
```

Open http://localhost:8000 and start creating! 🎨
