# Art Style Fusion Prompt Engineer

A containerized JavaScript application for creating rich, detailed prompts by combining art styles, image descriptions, and artist inspirations. Perfect for artists, writers, and AI enthusiasts looking to generate creative content with detailed prompts suitable for text-to-image generators.

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose installed
- API key from OpenAI or OpenRouter

### 1. Clone & Configure
```bash
git clone https://github.com/ergonomech/Art-Style-Fusion-Prompt-Enginner.git
cd Art-Style-Fusion-Prompt-Enginner/js-app
cp .env.example .env
```

### 2. Add API Keys
Edit `.env` file with your API keys:
```env
OPENAI_API_KEY=sk-your_actual_key_here
# OR
OPENROUTER_API_KEY=your_openrouter_key_here
```

### 3. Deploy
```bash
docker-compose up --build -d
```

### 4. Access
Open http://localhost:8000

## 🔧 Docker Commands

```bash
# Start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Rebuild
docker-compose up --build -d
```

## 🎨 Features

- **Image Analysis**: Upload and analyze images using AI vision models
- **Art Style Selection**: Choose from various artistic styles
- **Artist Recommendations**: Get personalized artist suggestions
- **Custom Inputs**: Add your own creative elements
- **Prompt Generation**: Generate comprehensive, AI-ready prompts
- **Export Options**: Copy to clipboard or download as text file
- **Multiple AI Providers**: Support for OpenAI, OpenRouter, and Ollama

## � API Keys Setup

### OpenAI
1. Visit https://platform.openai.com/api-keys
2. Create API key (starts with `sk-`)
3. Add to `.env`: `OPENAI_API_KEY=sk-your_key`

### OpenRouter  
1. Visit https://openrouter.ai/
2. Get API key from dashboard
3. Add to `.env`: `OPENROUTER_API_KEY=your_key`

### Ollama (Optional)
1. Install Ollama locally
2. Run: `ollama pull llama3.2-vision`
3. Configure in `.env`: `OLLAMA_SERVER_URL=http://host.docker.internal:11434`

## 🏗️ Project Structure
```
js-app/
├── public/                     # Frontend (HTML/CSS/JS)
├── server/                     # Backend (Express.js API)  
├── deprecated_gradio_reference/ # Original Gradio app
├── Dockerfile                  # Container definition
├── docker-compose.yml         # Container orchestration
└── .env.example               # Environment template
```

## 🚨 Troubleshooting

### Common Issues
```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f

# Clean restart
docker-compose down
docker-compose up --build -d
```

### API Issues
- Verify API keys in `.env` file (no extra spaces)
- Check API key has sufficient credits
- Ensure at least one API provider is configured

## 📄 License

MIT License

---

Ready to create amazing AI prompts? Just run `docker-compose up --build -d` and open http://localhost:8000! 🎨

## 🔧 API Keys Setup

### OpenAI (Recommended)
1. Visit [platform.openai.com](https://platform.openai.com/api-keys)
2. Create API key (starts with `sk-`)
3. Add to `.env`: `OPENAI_API_KEY=sk-your_key`

### OpenRouter (Alternative)
1. Visit [openrouter.ai](https://openrouter.ai/)
2. Get API key from dashboard
3. Add to `.env`: `OPENROUTER_API_KEY=your_key`

### Ollama (Local AI - Optional)
1. Install Ollama locally
2. Run: `ollama pull llama3.2-vision`
3. Configure in `.env`: `OLLAMA_SERVER_URL=http://host.docker.internal:11434`

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

## 🎨 Usage

1. **Upload Image**: Drag & drop or select an image file
2. **Choose Art Style**: Select from various artistic movements
3. **Analyze**: AI analyzes your image and generates descriptions
4. **Generate**: Create artist recommendations and style descriptions
5. **Customize**: Add your own creative elements
6. **Export**: Copy final prompt or download as text file

## 🔒 Security Features

- **Container Security**: Non-root user, read-only filesystem
- **API Protection**: Rate limiting and input validation
- **Environment Isolation**: Secure environment variable handling
- **Health Checks**: Container monitoring and auto-restart

## 📱 Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## 🔧 Development

To modify the application:

```bash
# Make changes to source code
# Then rebuild container
docker-compose up --build -d
```

### Project Structure
```
js-app/
├── public/                     # Frontend (HTML/CSS/JS)
├── server/                     # Backend (Express.js API)  
├── deprecated_gradio_reference/ # Original Gradio app
├── Dockerfile                  # Container definition
├── docker-compose.yml         # Container orchestration
├── deploy.sh / deploy.ps1     # Deployment scripts
└── .env.example               # Environment template
```

## 🚨 Troubleshooting

### Container Issues
```bash
# Check container status
docker-compose ps

# View detailed logs
docker-compose logs -f art-style-fusion

# Restart containers
docker-compose restart

# Clean rebuild
docker-compose down
docker-compose up --build -d
```

### API Issues
- Verify API keys in `.env` file
- Check API key has sufficient credits
- Ensure no extra spaces around keys

### Port Conflicts
- Change port in docker-compose.yml if 8000 is in use
- Use `docker-compose down` to stop conflicting containers

## 🤝 Contributing

1. Fork the repository
2. Make changes to the application code
3. Test with `docker-compose up --build`
4. Submit pull request

## 📄 License

MIT License - see [LICENSE](../LICENSE)

---

**Ready to create amazing AI prompts?** Just run `./deploy.sh` and start creating!

## 🔧 Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=8000
NODE_ENV=development

# API Keys (at least one required)
OPENAI_API_KEY=your_openai_key_here
OPENROUTER_API_KEY=your_openrouter_key_here

# API Endpoints
OPENAI_URL=https://api.openai.com/v1/chat/completions
OPENROUTER_URL=https://openrouter.ai/api/v1/chat/completions

# Ollama Configuration (optional)
OLLAMA_SERVER_URL=http://localhost:11434
OLLAMA_MODEL_NAME=llama3.2-vision:11b-instruct-q4_K_M

# Base Prompts (customize as needed)
BASE_STYLE_PROMPT=Describe the unique visual characteristics of the selected art style...
BASE_IMAGE_PROMPT=Provide a highly detailed description of the image...
BASE_ARTIST_PROMPT=Suggest an artist whose unique style matches...
BASE_GENERATE_PROMPT=Combine the chosen style, image description...
```

### API Keys Setup

1. **OpenAI API Key:**
   - Visit https://platform.openai.com/api-keys
   - Create a new API key
   - Add to `.env` as `OPENAI_API_KEY`

2. **OpenRouter API Key:**
   - Visit https://openrouter.ai/
   - Sign up and get your API key
   - Add to `.env` as `OPENROUTER_API_KEY`

3. **Ollama (Optional):**
   - Install Ollama locally or on a server
   - Pull a vision model: `ollama pull llama3.2-vision`
   - Configure server URL in `.env`

## 🏗️ Architecture

### Frontend
- **Vanilla JavaScript**: Modern ES6+ features
- **CSS Grid & Flexbox**: Responsive layout
- **Fetch API**: HTTP requests
- **Progressive Enhancement**: Works without JavaScript for basic functionality

### Backend
- **Node.js + Express**: RESTful API server
- **Multer**: File upload handling
- **Sharp**: Image processing
- **Axios**: API requests
- **Helmet**: Security middleware
- **Rate Limiting**: API protection

### Docker
- **Multi-stage build**: Optimized container size
- **Non-root user**: Security best practices
- **Health checks**: Container monitoring
- **Volume mounts**: Persistent storage

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get application configuration |
| POST | `/api/analyze-image` | Analyze uploaded image |
| POST | `/api/generate-style-description` | Generate art style description |
| POST | `/api/recommend-artist` | Get artist recommendation |
| POST | `/api/generate-prompt` | Generate final prompt |

## 🎨 Supported Art Styles

- Impressionism
- Cubism
- Surrealism
- Abstract Expressionism
- Renaissance
- Baroque
- Art Nouveau
- Minimalism
- And more...

## 🔒 Security Features

- **Helmet.js**: Security headers
- **Rate Limiting**: API protection
- **File Validation**: Image upload security
- **Environment Variables**: Sensitive data protection
- **Non-root Docker User**: Container security
- **Input Sanitization**: XSS prevention

## 📱 Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## 🔧 Development

### Scripts

```bash
npm run dev          # Start development with hot reload
npm run server       # Start backend only
npm run client       # Start frontend only
npm run build        # Build for production
npm run preview      # Preview production build
npm start           # Start production server
```

### Project Structure

```
js-app/
├── public/             # Frontend files
│   ├── index.html     # Main HTML
│   ├── styles.css     # Styles
│   └── script.js      # Frontend logic
├── server/            # Backend files
│   └── index.js       # Express server
├── dist/              # Built files
├── Dockerfile         # Container definition
├── docker-compose.yml # Container orchestration
├── package.json       # Dependencies
└── .env              # Environment variables
```

## 🐳 Docker Deployment

### Development
```bash
docker-compose up
```

### Production
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Custom Build
```bash
docker build -t art-style-fusion .
docker run -p 8000:8000 --env-file .env art-style-fusion
```

## 🚨 Troubleshooting

### Common Issues

1. **API Key Errors:**
   - Verify API keys in `.env` file
   - Check API key permissions
   - Ensure sufficient API credits

2. **Image Upload Fails:**
   - Check file size (max 10MB)
   - Verify image format (PNG, JPG, GIF)
   - Ensure proper file permissions

3. **Docker Issues:**
   - Check Docker and Docker Compose installation
   - Verify port 8000 is available
   - Check container logs: `docker-compose logs`

4. **Build Errors:**
   - Clear node_modules: `rm -rf node_modules && npm install`
   - Check Node.js version (18+ required)
   - Verify all dependencies are installed

### Logs

```bash
# Docker logs
docker-compose logs -f

# Application logs
npm run server  # Check console output
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## 🙏 Acknowledgments

- Original Gradio application concept
- OpenAI and OpenRouter for AI API services
- Ollama for local AI model support
- Font Awesome for icons
- Google Fonts for typography

## 📞 Support

For support, please:
1. Check the troubleshooting section
2. Open an issue on GitHub
3. Contact the maintainers

---

**Note**: This JavaScript application replaces the deprecated Gradio version while maintaining all core functionality with improved performance, security, and user experience.
