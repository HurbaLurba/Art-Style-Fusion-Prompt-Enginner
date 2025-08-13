const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const axios = require('axios');
require('dotenv').config();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 8000;

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api', limiter);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve built frontend
app.use(express.static(path.join(__dirname, '../dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// API Classes
class APIClient {
  constructor(key, url, model, tokenLimit = 2048, temperature = 0.7, topP = 0.9) {
    this.key = key;
    this.url = url;
    this.model = model;
    this.tokenLimit = tokenLimit;
    this.temperature = temperature;
    this.topP = topP;
  }

  async makeRequest(prompt, imageData = null) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.key}`
      };

      const content = [{ type: 'text', text: prompt }];
      if (imageData) {
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${imageData}`,
            detail: 'high'
          }
        });
      }

      const payload = {
        model: this.model,
        messages: [{ role: 'user', content: content }],
        max_tokens: this.tokenLimit,
        temperature: this.temperature,
        top_p: this.topP
      };

      const response = await axios.post(this.url, payload, { headers });
      return response.data.choices[0].message.content.trim();
    } catch (error) {
      console.error('API Error:', error.message);
      throw new Error(`API Error: ${error.message}`);
    }
  }

  async ollamaAnalyzeImage(imageBuffer) {
    try {
      const generateUrl = `${this.url}/api/generate`;
      const base64Image = imageBuffer.toString('base64');
      
      const payload = {
        model: this.model,
        prompt: 'Analyze the image, focusing on specific objects, body types, colors, textures, gender expressions...',
        images: [base64Image],
        stream: false
      };

      const response = await axios.post(generateUrl, payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      return response.data.response;
    } catch (error) {
      console.error('Ollama API Error:', error.message);
      throw new Error(`Ollama API Error: ${error.message}`);
    }
  }

  async ollamaGenerateCompletion(prompt) {
    try {
      const generateUrl = `${this.url}/api/generate`;
      const payload = {
        model: this.model,
        prompt: prompt,
        stream: false
      };

      const response = await axios.post(generateUrl, payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      return response.data.response;
    } catch (error) {
      console.error('Ollama API Error:', error.message);
      throw new Error(`Ollama API Error: ${error.message}`);
    }
  }
}

class ImageProcessor {
  static async preprocessImage(buffer) {
    try {
      const image = sharp(buffer);
      const { width, height } = await image.metadata();
      
      const maxPixels = 1000000;
      const ratio = width / height;
      const newHeight = Math.floor(Math.sqrt(maxPixels / ratio));
      const newWidth = Math.floor(newHeight * ratio);

      const processedBuffer = await image
        .resize(newWidth, newHeight, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();

      return processedBuffer.toString('base64');
    } catch (error) {
      console.error('Image processing error:', error.message);
      throw new Error('Image processing failed');
    }
  }
}

// Load configuration
let config = {};
try {
  const configData = require('../deprecated_gradio_reference/static_config.json');
  config = configData;
} catch (error) {
  console.warn('Could not load static config, using defaults');
  config = {
    art_styles: ['Impressionism', 'Cubism', 'Surrealism', 'Abstract Expressionism'],
    generation: { temperature: 0.7, top_p: 0.9, token_limit: 4096 }
  };
}

// Helper function to create API client based on user settings
function createAPIClient(userSettings = {}) {
  // Priority: user settings > environment variables
  const openaiKey = userSettings.openai_api_key || process.env.OPENAI_API_KEY;
  const openaiModel = userSettings.openai_model || process.env.OPENAI_MODEL || 'gpt-4';
  const openaiUrl = 'https://api.openai.com/v1/chat/completions';

  const openrouterKey = userSettings.openrouter_api_key || process.env.OPENROUTER_API_KEY;
  const openrouterModel = userSettings.openrouter_model || process.env.OPENROUTER_MODEL || 'openai/gpt-4';
  const openrouterUrl = 'https://openrouter.ai/api/v1/chat/completions';

  const ollamaUrl = userSettings.ollama_base_url || process.env.OLLAMA_SERVER_URL || 'http://localhost:11434';
  const ollamaModel = userSettings.ollama_model || process.env.OLLAMA_MODEL_NAME || 'llava';

  // Return the first available client
  if (openaiKey) {
    return { 
      client: new APIClient(openaiKey, openaiUrl, openaiModel),
      type: 'openai',
      isVision: openaiModel.includes('vision') || openaiModel.includes('4')
    };
  }
  
  if (openrouterKey) {
    return { 
      client: new APIClient(openrouterKey, openrouterUrl, openrouterModel),
      type: 'openrouter',
      isVision: openrouterModel.includes('vision') || openrouterModel.includes('4')
    };
  }
  
  if (ollamaUrl && ollamaModel) {
    return { 
      client: new APIClient(null, ollamaUrl, ollamaModel),
      type: 'ollama',
      isVision: true // Assume ollama models support vision
    };
  }

  throw new Error('No API configuration available. Please configure at least one AI provider.');
}

// API Routes
app.get('/api/config', (req, res) => {
  res.json({
    artStyles: config.art_styles || ['Impressionism', 'Cubism', 'Surrealism', 'Abstract Expressionism'],
    generation: config.generation || { temperature: 0.7, top_p: 0.9, token_limit: 4096 }
  });
});

// Expose optional env hints to prefill UI
app.get('/api/env-hints', (req, res) => {
  res.json({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
    OLLAMA_BASE_URL: process.env.OLLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || ''
  })
})

// Get available models for each provider
app.get('/api/models', async (req, res) => {
  const models = {
    openai: [
      { value: 'gpt-4', label: 'GPT-4' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-4-vision-preview', label: 'GPT-4 Vision' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
    ],
    openrouter: [
      { value: 'openai/gpt-4', label: 'OpenAI GPT-4' },
      { value: 'openai/gpt-4-turbo', label: 'OpenAI GPT-4 Turbo' },
      { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus' },
      { value: 'anthropic/claude-3-sonnet', label: 'Claude 3 Sonnet' },
      { value: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku' },
      { value: 'google/gemini-pro', label: 'Gemini Pro' },
      { value: 'meta-llama/llama-3-70b-instruct', label: 'Llama 3 70B' }
    ],
    ollama: [
      { value: 'llava', label: 'LLaVA (Vision)' },
      { value: 'llama3', label: 'Llama 3' },
      { value: 'mistral', label: 'Mistral' },
      { value: 'codellama', label: 'Code Llama' },
      { value: 'gemma', label: 'Gemma' },
      { value: 'dolphin-mixtral', label: 'Dolphin Mixtral' }
    ]
  };

  // If ollama_url is provided, try to fetch actual models
  const ollamaUrl = req.query.ollama_url;
  if (ollamaUrl) {
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        if (data.models && Array.isArray(data.models)) {
          models.ollama = data.models.map(model => ({
            value: model.name,
            label: model.name
          }));
        }
      }
    } catch (error) {
      console.warn('Failed to fetch Ollama models:', error.message);
      // Keep default models if fetch fails
    }
  }
  
  res.json(models);
});

// Test provider connections
app.post('/api/test/openai', async (req, res) => {
  try {
    const { apiKey } = req.body || {}
    if (!apiKey) return res.status(400).json({ ok: false, error: 'Missing apiKey' })
    const url = 'https://api.openai.com/v1/models'
    const r = await axios.get(url, { headers: { Authorization: `Bearer ${apiKey}` }})
    return res.json({ ok: true, count: Array.isArray(r.data.data) ? r.data.data.length : 0 })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/models/openai', async (req, res) => {
  try {
    const apiKey = req.query.apiKey
    if (!apiKey) return res.status(400).json({ error: 'Missing apiKey' })
    const url = 'https://api.openai.com/v1/models'
    const r = await axios.get(url, { headers: { Authorization: `Bearer ${apiKey}` }})
    const list = (r.data.data || []).map(m => ({ value: m.id, label: m.id }))
    res.json({ models: list })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/test/openrouter', async (req, res) => {
  try {
    const { apiKey } = req.body || {}
    if (!apiKey) return res.status(400).json({ ok: false, error: 'Missing apiKey' })
    const url = 'https://openrouter.ai/api/v1/models'
    const r = await axios.get(url, { headers: { Authorization: `Bearer ${apiKey}` }})
    return res.json({ ok: true, count: Array.isArray(r.data.data) ? r.data.data.length : 0 })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/models/openrouter', async (req, res) => {
  try {
    const apiKey = req.query.apiKey
    if (!apiKey) return res.status(400).json({ error: 'Missing apiKey' })
    const url = 'https://openrouter.ai/api/v1/models'
    const r = await axios.get(url, { headers: { Authorization: `Bearer ${apiKey}` }})
    const list = (r.data.data || []).map(m => ({ value: m.id, label: m.name || m.id }))
    res.json({ models: list })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/test/ollama', async (req, res) => {
  try {
    const { baseUrl } = req.body || {}
    if (!baseUrl) return res.status(400).json({ ok: false, error: 'Missing baseUrl' })
    const r = await axios.get(`${baseUrl}/api/tags`)
    return res.json({ ok: true, count: Array.isArray(r.data.models) ? r.data.models.length : 0 })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Parse user settings from request
    let userSettings = {};
    try {
      userSettings = req.body.settings ? JSON.parse(req.body.settings) : {};
    } catch (error) {
      console.warn('Invalid settings JSON, using defaults');
    }

    const base64Image = await ImageProcessor.preprocessImage(req.file.buffer);
    
    try {
      const { client, type } = createAPIClient(userSettings);
      
      let analysis;
      if (type === 'ollama') {
        analysis = await client.ollamaAnalyzeImage(req.file.buffer);
      } else {
        const prompt = process.env.BASE_IMAGE_PROMPT || 'Analyze this image in detail, focusing on objects, colors, textures, composition, and artistic elements.';
        analysis = await client.makeRequest(prompt, base64Image);
      }
      
      return res.json({ analysis });
    } catch (error) {
      console.error('API client error:', error);
      return res.status(500).json({ error: error.message });
    }

  } catch (error) {
    console.error('Image analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-style-description', async (req, res) => {
  try {
    const { style, settings = {} } = req.body;
    
    if (!style) {
      return res.status(400).json({ error: 'Art style is required' });
    }

    try {
      const { client, type } = createAPIClient(settings);
      
      const basePrompt = process.env.BASE_STYLE_PROMPT || 'Describe the unique visual characteristics, techniques, and artistic elements of the selected art style in detail.';
      const prompt = `${basePrompt} Art style: ${style}`;
      
      let description;
      if (type === 'ollama') {
        description = await client.ollamaGenerateCompletion(prompt);
      } else {
        description = await client.makeRequest(prompt);
      }
      
      res.json({ description });
    } catch (error) {
      console.error('API client error:', error);
      return res.status(500).json({ error: error.message });
    }

  } catch (error) {
    console.error('Style description error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/recommend-artist', async (req, res) => {
  try {
  const { style, styleDescription, imageDescription, themes, settings = {} } = req.body;
    
    try {
      const { client, type } = createAPIClient(settings);
      
  const basePrompt = process.env.BASE_ARTIST_PROMPT || 'Suggest an artist whose unique style matches the provided art style, described characteristics, image description, and themes. Provide one strong recommendation with a short rationale.';
  const prompt = `${basePrompt}

  Art Style: ${style || 'Not specified'}
  Style Description: ${styleDescription || 'Not provided'}
  Image Description: ${imageDescription || 'Not provided'}
  Themes: ${themes || 'None'}

  Output format: Artist Name — brief rationale`;
      
  let recommendation;
      if (type === 'ollama') {
        recommendation = await client.ollamaGenerateCompletion(prompt);
      } else {
        recommendation = await client.makeRequest(prompt);
      }
      
  res.json({ recommendation });
    } catch (error) {
      console.error('API client error:', error);
      return res.status(500).json({ error: error.message });
    }

  } catch (error) {
    console.error('Artist recommendation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-prompt', async (req, res) => {
  try {
    const { style, imageDescription, artistRecommendation, customInputs, settings = {} } = req.body;
    
    try {
      const { client, type } = createAPIClient(settings);
      
      const basePrompt = process.env.BASE_PROMPT_GENERATION || 
        'Generate a detailed art prompt that combines the visual analysis, art style, and artist recommendation into a cohesive creative description suitable for AI image generation.';
      
      const fullPrompt = `${basePrompt}
      
      Art Style: ${style}
      Image Analysis: ${imageDescription}
      Artist Recommendation: ${artistRecommendation}
      Additional Requirements: ${customInputs || 'None'}
      
      Please create a comprehensive, detailed prompt for AI image generation that captures these elements.`;
      
      let prompt;
      if (type === 'ollama') {
        prompt = await client.ollamaGenerateCompletion(fullPrompt);
      } else {
        prompt = await client.makeRequest(fullPrompt);
      }
      
      res.json({ prompt });
    } catch (error) {
      console.error('API client error:', error);
      return res.status(500).json({ error: error.message });
    }

  } catch (error) {
    console.error('Prompt generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-flux-prompt', async (req, res) => {
  try {
    const { style, imageDescription, styleDescription, artistRecommendation, customInputs, settings = {} } = req.body;
    
    try {
      const { client, type } = createAPIClient(settings);
      
      const basePrompt = process.env.BASE_FLUX_PROMPT || 
        'Generate a detailed, comprehensive prompt suitable for T5-based models like Flux. Create rich, descriptive text that captures the artistic vision.';
      
      const fullPrompt = `${basePrompt}
      
      Art Style: ${style}
      Style Description: ${styleDescription || 'Not provided'}
      Image Description: ${imageDescription}
      Artist Recommendation: ${artistRecommendation}
      Additional Requirements: ${customInputs || 'None'}
      
      Please create a detailed, flowing prompt that combines all these elements into a cohesive description suitable for advanced AI image generation models like Flux that use T5 text encoders. The prompt should be descriptive, artistic, and comprehensive.`;
      
  let prompt;
      if (type === 'ollama') {
        prompt = await client.ollamaGenerateCompletion(fullPrompt);
      } else {
        prompt = await client.makeRequest(fullPrompt);
      }
  // Enforce max 256 words
  const trimmed = (prompt || '').split(/\s+/).slice(0, 256).join(' ');
      
  res.json({ prompt: trimmed });
    } catch (error) {
      console.error('API client error:', error);
      return res.status(500).json({ error: error.message });
    }

  } catch (error) {
    console.error('Flux prompt generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-sdxl-prompt', async (req, res) => {
  try {
    const { fluxPrompt, settings = {} } = req.body;
    
    try {
      const { client, type } = createAPIClient(settings);
      
      const basePrompt = process.env.BASE_SDXL_PROMPT || 
        'Convert this detailed T5/Flux prompt into a format suitable for Stable Diffusion XL. Focus on key visual elements, style descriptors, and technical terms that work well with SDXL.';
      
      const fullPrompt = `${basePrompt}
      
      Original T5/Flux Prompt: ${fluxPrompt}
      
      Please convert this into a concise, effective prompt for Stable Diffusion XL. Focus on:
      - Key visual elements and composition
      - Style and technique descriptors
      - Lighting and mood
      - Technical quality terms
      - Remove overly verbose descriptions while keeping the essence
      
      Create a clean, focused prompt that will work well with SDXL's training and capabilities.`;
      
  let prompt;
      if (type === 'ollama') {
        prompt = await client.ollamaGenerateCompletion(fullPrompt);
      } else {
        prompt = await client.makeRequest(fullPrompt);
      }
  // Enforce max 256 words
  const trimmed = (prompt || '').split(/\s+/).slice(0, 256).join(' ');
      
  res.json({ prompt: trimmed });
    } catch (error) {
      console.error('API client error:', error);
      return res.status(500).json({ error: error.message });
    }

  } catch (error) {
    console.error('SDXL prompt generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve the React app for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Art Style Fusion Server running on port ${PORT}`);
  console.log(`📱 Frontend: http://0.0.0.0:${PORT}`);
  console.log(`🔧 API: http://0.0.0.0:${PORT}/api`);
  console.log(`🌐 Access from host: http://localhost:7633`);
});
