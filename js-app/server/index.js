const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
require('dotenv').config();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const defaults = require('./config.json');

const app = express();
const PORT = process.env.PORT || 8000;

// Helmet CSP is disabled because the Mantine SPA injects inline <style> tags and
// style attributes from its theme runtime; the default CSP would block them.
// Other helmet protections remain active.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api', limiter);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../dist')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Provider presets: every provider is a generic OpenAI-compatible endpoint.
const PROVIDER_PRESETS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', needsKey: true, defaultModel: 'gpt-4o' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, defaultModel: 'openai/gpt-4o' },
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', needsKey: false, defaultModel: 'llama3.2-vision' },
  { id: 'vllm', label: 'vLLM', baseUrl: 'http://localhost:8001/v1', needsKey: false, defaultModel: '' },
  { id: 'llamacpp', label: 'llama.cpp', baseUrl: 'http://localhost:8080/v1', needsKey: false, defaultModel: '' },
  { id: 'custom', label: 'Custom', baseUrl: '', needsKey: false, defaultModel: '' }
];

const PRESET_BY_ID = Object.fromEntries(PROVIDER_PRESETS.map((p) => [p.id, p]));

function envKey(id, suffix) {
  return `${id.toUpperCase()}_${suffix}`;
}

function stripTrailingSlash(url) {
  return typeof url === 'string' ? url.replace(/\/+$/, '') : url;
}

// Build the effective provider config from user settings, then env, then preset.
function resolveProvider(settings = {}) {
  const providers = settings.providers || {};
  const generation = settings.generation || {};

  function configFor(id) {
    const preset = PRESET_BY_ID[id] || { baseUrl: '', defaultModel: '' };
    const user = providers[id] || {};
    const baseUrl = stripTrailingSlash(user.baseUrl || process.env[envKey(id, 'BASE_URL')] || preset.baseUrl || '');
    const apiKey = user.apiKey || process.env[envKey(id, 'API_KEY')] || '';
    const model = user.model || process.env[envKey(id, 'MODEL')] || preset.defaultModel || '';
    return { id, baseUrl, apiKey, model };
  }

  let id = settings.activeProvider || process.env.ACTIVE_PROVIDER || '';

  if (!id) {
    const usable = PROVIDER_PRESETS.map((p) => configFor(p.id)).find((c) => c.baseUrl && c.model);
    if (usable) id = usable.id;
  }

  if (!id) {
    throw new Error('No provider configured. Set ACTIVE_PROVIDER or supply provider settings with a baseUrl and model.');
  }

  const resolved = configFor(id);
  if (!resolved.baseUrl || !resolved.model) {
    throw new Error(`No provider configured for "${id}". A baseUrl and model are required.`);
  }

  const temperature = generation.temperature ?? num(process.env.GEN_TEMPERATURE) ?? defaults.generation.temperature ?? 0.7;
  const top_p = generation.top_p ?? num(process.env.GEN_TOP_P) ?? defaults.generation.top_p ?? 0.9;
  const max_tokens = generation.max_tokens ?? num(process.env.GEN_MAX_TOKENS) ?? defaults.generation.max_tokens ?? 4096;

  return { ...resolved, temperature, top_p, max_tokens };
}

function num(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Generic OpenAI-compatible client used for every provider.
class OpenAICompatClient {
  constructor({ id, baseUrl, apiKey, model, temperature, top_p, max_tokens }) {
    this.id = id;
    this.baseUrl = stripTrailingSlash(baseUrl);
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    this.top_p = top_p;
    this.max_tokens = max_tokens;
  }

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  extractUsage(usage) {
    if (!usage) return null;
    const total = usage.total_tokens
      ?? (usage.prompt_tokens != null && usage.completion_tokens != null
        ? usage.prompt_tokens + usage.completion_tokens
        : null);
    return {
      prompt: usage.prompt_tokens ?? null,
      completion: usage.completion_tokens ?? null,
      total: total ?? null
    };
  }

  async chat(prompt, { imageBase64 } = {}) {
    const url = `${this.baseUrl}/chat/completions`;
    const content = [{ type: 'text', text: prompt }];
    if (imageBase64) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${imageBase64}` }
      });
    }

    const body = {
      model: this.model,
      messages: [{ role: 'user', content }],
      max_tokens: this.max_tokens,
      temperature: this.temperature,
      top_p: this.top_p
    };

    const started = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body)
    });
    const durationMs = Date.now() - started;

    if (!response.ok) {
      const errText = (await response.text().catch(() => '')).slice(0, 500).trim();
      throw new Error(`Provider request failed (${response.status} ${response.statusText}) at ${url}: ${errText}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    const usage = this.extractUsage(data?.usage);
    return {
      text,
      meta: {
        provider: this.id,
        model: this.model,
        endpoint: url,
        ms: durationMs,
        tokens: data?.usage?.total_tokens ?? null,
        usage
      }
    };
  }

  async listModels() {
    try {
      const url = `${this.baseUrl}/models`;
      const response = await fetch(url, { headers: this.headers() });
      if (!response.ok) return [];
      const data = await response.json();
      const list = Array.isArray(data?.data) ? data.data : [];
      return list.map((m) => ({ value: m.id, label: m.id }));
    } catch {
      return [];
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

// Build a client from request settings (used by the prompt/analysis endpoints).
function clientFromSettings(settings = {}) {
  return new OpenAICompatClient(resolveProvider(settings));
}

// Build a transient client for ad-hoc baseUrl/apiKey calls (models, test).
function transientClient(baseUrl, apiKey) {
  return new OpenAICompatClient({
    id: 'custom',
    baseUrl: baseUrl || '',
    apiKey: apiKey || '',
    model: '',
    temperature: defaults.generation.temperature,
    top_p: defaults.generation.top_p,
    max_tokens: defaults.generation.max_tokens
  });
}

// API Routes

app.get('/api/config', (req, res) => {
  res.json({
    artStyles: defaults.artStyles,
    generation: {
      temperature: defaults.generation.temperature,
      top_p: defaults.generation.top_p,
      max_tokens: defaults.generation.max_tokens
    },
    providerPresets: PROVIDER_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      baseUrl: p.baseUrl,
      needsKey: p.needsKey,
      defaultModel: p.defaultModel
    }))
  });
});

// Surface only env-provided values so the UI can prefill without leaking blanks.
app.get('/api/env-hints', (req, res) => {
  const providers = {};
  for (const preset of PROVIDER_PRESETS) {
    const id = preset.id;
    const baseUrl = process.env[envKey(id, 'BASE_URL')];
    const apiKey = process.env[envKey(id, 'API_KEY')];
    const model = process.env[envKey(id, 'MODEL')];
    const entry = {};
    if (baseUrl) entry.baseUrl = baseUrl;
    if (apiKey) entry.apiKey = apiKey;
    if (model) entry.model = model;
    if (Object.keys(entry).length) providers[id] = entry;
  }
  res.json({
    activeProvider: process.env.ACTIVE_PROVIDER || '',
    providers
  });
});

app.post('/api/models', async (req, res) => {
  try {
    const { baseUrl, apiKey } = req.body || {};
    if (!baseUrl) return res.status(400).json({ error: 'Missing baseUrl' });
    const client = transientClient(baseUrl, apiKey);
    const models = await client.listModels();
    res.json({ models });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/test', async (req, res) => {
  try {
    const { baseUrl, apiKey } = req.body || {};
    if (!baseUrl) return res.status(500).json({ ok: false, error: 'Missing baseUrl' });
    const url = `${stripTrailingSlash(baseUrl)}/models`;
    const headers = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const errText = (await response.text().catch(() => '')).slice(0, 300).trim();
      return res.status(500).json({ ok: false, error: `${response.status} ${response.statusText}: ${errText}` });
    }
    const data = await response.json();
    const count = Array.isArray(data?.data) ? data.data.length : 0;
    res.json({ ok: true, count });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    let settings = {};
    try {
      settings = req.body.settings ? JSON.parse(req.body.settings) : {};
    } catch {
      console.warn('Invalid settings JSON, using defaults');
    }

    const imageBase64 = await ImageProcessor.preprocessImage(req.file.buffer);
    const client = clientFromSettings(settings);
    const prompt = process.env.BASE_IMAGE_PROMPT
      || 'Analyze this image in detail, focusing on objects, colors, textures, composition, and artistic elements.';

    const result = await client.chat(prompt, { imageBase64 });
    res.json({ analysis: result.text, meta: result.meta });
  } catch (error) {
    console.error('Image analysis error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-style-description', async (req, res) => {
  try {
    const { style, settings = {} } = req.body;
    if (!style) {
      return res.status(400).json({ error: 'Art style is required' });
    }

    const client = clientFromSettings(settings);
    const basePrompt = process.env.BASE_STYLE_PROMPT
      || 'Describe the unique visual characteristics, techniques, and artistic elements of the selected art style in detail.';
    const prompt = `${basePrompt} Art style: ${style}`;

    const result = await client.chat(prompt);
    res.json({ description: result.text, meta: result.meta });
  } catch (error) {
    console.error('Style description error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/recommend-artist', async (req, res) => {
  try {
    const { style, styleDescription, imageDescription, themes, settings = {} } = req.body;

    const client = clientFromSettings(settings);
    const basePrompt = process.env.BASE_ARTIST_PROMPT
      || 'Suggest an artist whose unique style matches the provided art style, described characteristics, image description, and themes. Provide one strong recommendation with a short rationale.';
    const prompt = `${basePrompt}

  Art Style: ${style || 'Not specified'}
  Style Description: ${styleDescription || 'Not provided'}
  Image Description: ${imageDescription || 'Not provided'}
  Themes: ${themes || 'None'}

  Output format: Artist Name — brief rationale`;

    const result = await client.chat(prompt);
    res.json({ recommendation: result.text, meta: result.meta });
  } catch (error) {
    console.error('Artist recommendation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-prompt', async (req, res) => {
  try {
    const { style, imageDescription, artistRecommendation, customInputs, settings = {} } = req.body;

    const client = clientFromSettings(settings);
    const basePrompt = process.env.BASE_PROMPT_GENERATION
      || 'Generate a detailed art prompt that combines the visual analysis, art style, and artist recommendation into a cohesive creative description suitable for AI image generation.';

    const fullPrompt = `${basePrompt}

      Art Style: ${style}
      Image Analysis: ${imageDescription}
      Artist Recommendation: ${artistRecommendation}
      Additional Requirements: ${customInputs || 'None'}

      Please create a comprehensive, detailed prompt for AI image generation that captures these elements.`;

    const result = await client.chat(fullPrompt);
    res.json({ prompt: result.text, meta: result.meta });
  } catch (error) {
    console.error('Prompt generation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-flux-prompt', async (req, res) => {
  try {
    const { style, imageDescription, styleDescription, artistRecommendation, customInputs, settings = {} } = req.body;

    const client = clientFromSettings(settings);
    // Raise the output token ceiling specifically for the Flux/T5 style prompt.
    client.max_tokens = Math.max(client.max_tokens || 0, 4000);

    const basePrompt = process.env.BASE_FLUX_PROMPT
      || 'Generate a detailed yet efficiently worded artistic prompt suitable for T5-based models like Flux. The final prompt MUST be between 256 and 512 words: never exceed 512 words, and do not go under 240 words unless information is missing. Avoid redundant adjectives, collapse repeated concepts, and prefer concrete visual nouns over vague filler. Use varied sentence structures for flow. Do not number or bullet; produce a single cohesive textual block.';

    const fullPrompt = `${basePrompt}

      Art Style: ${style}
      Style Description: ${styleDescription || 'Not provided'}
      Image Description: ${imageDescription}
      Artist Recommendation: ${artistRecommendation}
      Additional Requirements: ${customInputs || 'None'}

      TASK: Integrate only salient distinct details from the above. Strip repetition, generic hype words, and weak intensifiers. Emphasize: subject focus, composition, perspective, lighting, palette, materials/textures, mood/atmosphere, stylistic technique, and any thematic motifs. Inline style/artist influences naturally. Do NOT include explicit word counts, disclaimers, meta-instructions, or model references. Output a SINGLE PARAGRAPH within 256–512 words.`;

    const result = await client.chat(fullPrompt);
    const words = (result.text || '').split(/\s+/);
    const capped = words.slice(0, 512).join(' ');
    res.json({ prompt: capped, meta: { ...result.meta, enforcedWordCap: words.length > 512 ? 512 : words.length } });
  } catch (error) {
    console.error('Flux prompt generation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-sdxl-prompt', async (req, res) => {
  try {
    const { fluxPrompt, settings = {} } = req.body;

    const client = clientFromSettings(settings);
    const basePrompt = process.env.BASE_SDXL_PROMPT
      || 'Convert this detailed T5/Flux prompt into a format suitable for Stable Diffusion XL. Focus on key visual elements, style descriptors, and technical terms that work well with SDXL.';

    const fullPrompt = `${basePrompt}

      Original T5/Flux Prompt: ${fluxPrompt}

      Please convert this into a concise, effective prompt for Stable Diffusion XL. Focus on:
      - Key visual elements and composition
      - Style and technique descriptors
      - Lighting and mood
      - Technical quality terms
      - Remove overly verbose descriptions while keeping the essence

      Create a clean, focused prompt that will work well with SDXL's training and capabilities.`;

    const result = await client.chat(fullPrompt);
    const trimmed = (result.text || '').split(/\s+/).slice(0, 256).join(' ');
    res.json({ prompt: trimmed, meta: result.meta });
  } catch (error) {
    console.error('SDXL prompt generation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Single SPA fallback. Express 5 rejects bare `app.get('*')`, so use a middleware
// placed after all /api routes that serves the built index.html for GET navigation.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Art Style Fusion server listening on http://0.0.0.0:${PORT}`);
  console.log('Serving the SPA from ../dist and the API under /api');
});
