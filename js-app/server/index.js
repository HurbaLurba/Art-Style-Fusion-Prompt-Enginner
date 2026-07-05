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

// Minimal logging by design: the server is stateless and privacy-preserving.
// It logs only short error scopes/messages — never request bodies, prompts,
// image data, generated outputs, or API keys. History lives only in the browser.
const logError = (scope, err) => console.error(`[asf] ${scope}: ${err?.message || err}`);

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

// Default image-analysis prompt. Produces a reconstruction-grade description so
// the image can be recreated from text alone. This is a private, adults-only
// tool: mature/explicit content is described factually rather than refused.
// Watermarks/logos/overlaid text are excluded so the recreation stays clean.
// The ~4000-token target is stated in the prompt (not enforced as a hard cap),
// and the endpoint raises max_tokens so the description never crops mid-thought.
const DEFAULT_IMAGE_PROMPT = `You are an expert visual analyst. Produce a complete, faithful description of the provided image so that an image-generation model could recreate it from your text alone. Describe only what is actually visible, in a neutral and clinical tone, without moralizing and without refusing.

This is a private tool used by and depicting consenting adults. The image may contain mature, suggestive, or sexually explicit content; treat every depicted person as an adult. Describe such content directly, factually, and without euphemism — anatomy, pose, state of dress or undress, and explicit details included when present — exactly as you would describe any other subject.

Work from the primary subject outward and weave these aspects into rich, continuous prose:
- Subject(s): count, adult age impression, build and body type, pose and gesture, facial expression, gaze direction, hair (color, length, style), skin tone and visible skin/anatomy, and state of clothing or undress with explicit detail when present.
- Wardrobe and accessories: garments, fabrics, colors, fit, condition, and how they drape, cling, or reveal.
- Composition: framing, shot type, camera angle and distance, subject placement, and perspective.
- Lighting: direction, hardness or softness, color temperature, highlights, shadows, and resulting mood.
- Color: dominant palette, accent colors, saturation, and contrast.
- Setting and background: location, props, and the spatial relationship between foreground, midground, and background.
- Texture and materials: skin, fabric, surfaces, and the level of rendered detail.
- Style and medium: photographic or illustrated, the specific art style, lens/film/rendering characteristics, and overall aesthetic.

Exclude entirely any watermarks, logos, signatures, captions, usernames, site names, timestamps, or other text and graphics overlaid on top of the image — do not mention them at all, so the recreation stays clean. You may still describe text or signage that is naturally part of the depicted scene.

Write one exhaustive, well-organized description in flowing prose rather than bullet lists. Be thorough but efficient, and aim to keep the description under roughly 4000 tokens. Always finish completely — never stop mid-sentence or leave the description truncated.`;

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
    // Only auto-pick a provider the user or env actually gave a model for —
    // never fall back to a preset default (which would silently target a local
    // server like Ollama that may not be running).
    const usable = PROVIDER_PRESETS.map((p) => p.id).find((pid) => {
      const hasModel = Boolean((providers[pid] || {}).model || process.env[envKey(pid, 'MODEL')]);
      return hasModel && configFor(pid).baseUrl;
    });
    if (usable) id = usable;
  }

  if (!id) {
    throw new Error('No provider configured. Set ACTIVE_PROVIDER or supply provider settings with a baseUrl and model.');
  }

  const resolved = configFor(id);
  if (!resolved.baseUrl || !resolved.model) {
    throw new Error(`No provider configured for "${id}". A baseUrl and model are required.`);
  }

  const temperature = num(generation.temperature) ?? num(process.env.GEN_TEMPERATURE) ?? defaults.generation.temperature ?? 0.7;
  const top_p = num(generation.top_p) ?? num(process.env.GEN_TOP_P) ?? defaults.generation.top_p ?? 0.9;
  const max_tokens = num(generation.max_tokens) ?? num(process.env.GEN_MAX_TOKENS) ?? defaults.generation.max_tokens ?? 4096;
  // Non-standard sampling params — left undefined (unsent) unless explicitly set,
  // since OpenAI rejects them while OpenRouter/vLLM/llama.cpp/Ollama accept them.
  const top_k = num(generation.top_k) ?? num(process.env.GEN_TOP_K);
  const min_p = num(generation.min_p) ?? num(process.env.GEN_MIN_P);

  return { ...resolved, temperature, top_p, max_tokens, top_k, min_p };
}

function num(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Assemble "Label: value" context lines, omitting any empty/blank values so a
// missing upstream input (e.g. no artist recommendation) leaves no dangling label.
function buildContext(pairs) {
  return pairs
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n      ');
}

// Built-in base prompts for each step. The UI can override any of these per
// session (settings.prompts), and env vars can override them globally.
const DEFAULT_PROMPTS = {
  image: DEFAULT_IMAGE_PROMPT,
  style: 'Describe the unique visual characteristics, techniques, and artistic elements of the selected art style in detail.',
  artist: 'Suggest an artist whose unique style matches the provided art style, described characteristics, image description, and themes. Provide one strong recommendation with a short rationale.',
  prompt: 'Generate a detailed art prompt that combines the visual analysis, art style, and artist recommendation into a cohesive creative description suitable for AI image generation.',
  flux: 'Generate a detailed yet efficiently worded artistic prompt suitable for T5-based models like Flux. The final prompt MUST be between 256 and 512 words: never exceed 512 words, and do not go under 240 words unless information is missing. Avoid redundant adjectives, collapse repeated concepts, and prefer concrete visual nouns over vague filler. Use varied sentence structures for flow. Do not number or bullet; produce a single cohesive textual block.',
  sdxl: 'Convert this detailed T5/Flux prompt into a format suitable for Stable Diffusion XL. Focus on key visual elements, style descriptors, and technical terms that work well with SDXL.',
};

const PROMPT_ENV = {
  image: 'BASE_IMAGE_PROMPT',
  style: 'BASE_STYLE_PROMPT',
  artist: 'BASE_ARTIST_PROMPT',
  prompt: 'BASE_PROMPT_GENERATION',
  flux: 'BASE_FLUX_PROMPT',
  sdxl: 'BASE_SDXL_PROMPT',
};

// Resolve a base prompt: per-session UI override -> env override -> built-in default.
function resolvePrompt(settings, key) {
  const fromSettings = settings?.prompts?.[key];
  if (fromSettings && String(fromSettings).trim()) return fromSettings;
  const env = process.env[PROMPT_ENV[key]];
  if (env && env.trim()) return env;
  return DEFAULT_PROMPTS[key];
}

// Detect a vision-capable model from OpenRouter-style metadata. OpenRouter
// exposes architecture.input_modalities (e.g. ["text","image"]) and a modality
// string like "text+image->text"; other providers don't, so this only matches
// where that metadata is present.
function isVisionModel(m) {
  const arch = m?.architecture || {};
  if (Array.isArray(arch.input_modalities)) return arch.input_modalities.includes('image');
  if (typeof arch.modality === 'string') return /image/i.test(arch.modality);
  return false;
}

// Generic OpenAI-compatible client used for every provider.
class OpenAICompatClient {
  constructor({ id, baseUrl, apiKey, model, temperature, top_p, max_tokens, top_k, min_p }) {
    this.id = id;
    this.baseUrl = stripTrailingSlash(baseUrl);
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    this.top_p = top_p;
    this.max_tokens = max_tokens;
    this.top_k = top_k;
    this.min_p = min_p;
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

    const baseBody = {
      model: this.model,
      messages: [{ role: 'user', content }],
      max_tokens: this.max_tokens,
      temperature: this.temperature,
      top_p: this.top_p
    };
    // Optional non-standard sampling params: sent only when set. If the provider
    // rejects them (OpenAI does), we drop them and retry once so the request
    // still succeeds — "ignore where top_k/min_p aren't changeable".
    const extras = {};
    if (this.top_k != null) extras.top_k = this.top_k;
    if (this.min_p != null) extras.min_p = this.min_p;
    const extraKeys = Object.keys(extras);

    const post = (payload) =>
      fetch(url, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });

    const started = Date.now();
    let response = await post({ ...baseBody, ...extras });
    let droppedSamplingParams;

    if (!response.ok && extraKeys.length && (response.status === 400 || response.status === 422)) {
      const errText = (await response.text().catch(() => '')).toLowerCase();
      const paramRejected = /top_k|min_p|unrecognized|unsupported|unexpected|additional|unknown|not permitted|extra/.test(errText);
      if (paramRejected) {
        droppedSamplingParams = extraKeys;
        response = await post(baseBody);
      } else {
        throw new Error(`Provider request failed (${response.status} ${response.statusText}) at ${url}: ${errText.slice(0, 500).trim()}`);
      }
    }
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
        tokens: usage?.total ?? null,
        usage,
        ...(droppedSamplingParams ? { droppedSamplingParams } : {})
      }
    };
  }

  async listModels({ visionOnly = false } = {}) {
    try {
      const url = `${this.baseUrl}/models`;
      const response = await fetch(url, { headers: this.headers() });
      if (!response.ok) return [];
      const data = await response.json();
      let list = Array.isArray(data?.data) ? data.data : [];
      if (visionOnly) list = list.filter(isVisionModel);
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
    })),
    defaultPrompts: DEFAULT_PROMPTS
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
    const { baseUrl, apiKey, providerId } = req.body || {};
    if (!baseUrl) return res.status(400).json({ error: 'Missing baseUrl' });
    const client = transientClient(baseUrl, apiKey);
    // OpenRouter reports per-model modality; restrict its list to vision models
    // (image -> text), since the chosen model also runs the image-analysis step.
    const visionOnly = providerId === 'openrouter' || /openrouter\.ai/i.test(baseUrl);
    const models = await client.listModels({ visionOnly });
    res.json({ models });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/test', async (req, res) => {
  try {
    const { baseUrl, apiKey } = req.body || {};
    if (!baseUrl) return res.status(400).json({ ok: false, error: 'Missing baseUrl' });
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
    // Give the description room to complete without cropping. The ~4000-token
    // target lives in the prompt text, not as a restrictive cap here.
    client.max_tokens = Math.max(client.max_tokens || 0, 8192);
    const prompt = resolvePrompt(settings, 'image');

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
    const basePrompt = resolvePrompt(settings, 'style');
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
    const basePrompt = resolvePrompt(settings, 'artist');
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
    const basePrompt = resolvePrompt(settings, 'prompt');

    const context = buildContext([
      ['Art Style', style],
      ['Image Analysis', imageDescription],
      ['Artist Recommendation', artistRecommendation],
      ['Additional Requirements', customInputs || 'None'],
    ]);
    const fullPrompt = `${basePrompt}

      ${context}

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

    const basePrompt = resolvePrompt(settings, 'flux');

    const context = buildContext([
      ['Art Style', style],
      ['Style Description', styleDescription],
      ['Image Description', imageDescription],
      ['Artist Recommendation', artistRecommendation],
      ['Additional Requirements', customInputs || 'None'],
    ]);
    const fullPrompt = `${basePrompt}

      ${context}

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
    const basePrompt = resolvePrompt(settings, 'sdxl');

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

  logError('server', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Art Style Fusion server listening on http://0.0.0.0:${PORT}`);
  console.log('Serving the SPA from ../dist and the API under /api');
});
