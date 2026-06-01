# 🎨 Art Style Fusion Prompt Engineer

A single-page web app that helps you compose rich, production-ready text-to-image prompts by fusing AI-powered image analysis, an art style description, and an artist recommendation into both **Flux/T5** and **SDXL** prompt formats.

Works against **any OpenAI-compatible LLM backend** — cloud or local — with zero provider lock-in.

**Features at a glance:**

- Upload an image and extract a detailed visual description via a vision model
- Generate an art style description for any artistic movement
- Get an artist recommendation that fits the chosen style
- Produce a Flux/T5 prompt and an SDXL prompt from those inputs
- Switch providers in the UI at runtime — no restarts required
- Outputs are copyable; session state persists in localStorage
- Dark-themed React UI, fully responsive

---

## 🔌 Supported AI Backends

The server calls `{baseUrl}/chat/completions` and `{baseUrl}/models` — the standard OpenAI API shape. Any compliant server works.

| Provider | Example Base URL | API Key Required? | Notes |
| --- | --- | --- | --- |
| **OpenAI** | `https://api.openai.com/v1` | Yes | `gpt-4o` is the default model |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Yes | Access 200+ models via one key |
| **Ollama** | `http://localhost:11434/v1` | No | Run `ollama pull llama3.2-vision` for vision |
| **vLLM** | `http://localhost:8001/v1` | No | Serve with `vllm serve <model>` |
| **llama.cpp** | `http://localhost:8080/v1` | No | Run `llama-server -m model.gguf --port 8080` |
| **Custom** | Any OpenAI-compatible URL | Optional | Must include the `/v1` path segment |

> **Image analysis** requires a vision-capable model (one that accepts `image_url` content). Standard text-only models will fail on the analyze step.
>
> **Running in Docker and pointing at a local LLM?** Use `http://host.docker.internal:<port>/v1` instead of `localhost` — the compose file already adds the `host-gateway` mapping.

---

## 🚀 Quick Start — Docker

```bash
# Optional: prefill provider config from env vars
cp .env.example .env
# Edit .env if you want env-var prefill — or configure entirely in the UI

docker compose up --build -d
```

Open **<http://localhost:7633>**, click the ⚙️ gear icon in the header, fill in your provider's Base URL, API Key (if needed), and Model, then hit **Test** to verify connectivity. Use the provider dropdown in the header to switch active providers.

---

## 🛠️ Quick Start — Local Dev

**Node >= 20 required.**

```bash
npm install

# Development: Vite dev server on :5173, Express API on :8000 (proxied via /api)
npm run dev

# Production-style: build the SPA then serve everything from Express on :8000
npm run build
npm start
```

### npm scripts

| Script | What it does |
| --- | --- |
| `dev` | Starts Express (nodemon) + Vite concurrently |
| `client` | Vite dev server only |
| `server:dev` | Express only via nodemon |
| `build` | Vite production build into `dist/` |
| `preview` | Vite preview of the production build |
| `start` | Node Express server (serves built `dist/`) |

---

## ⚙️ Configuration

### UI config flow (primary)

Open the **⚙️ AI Configuration** modal in the header. For each provider, enter:

- **Base URL** — must include the `/v1` segment (e.g. `https://api.openai.com/v1`)
- **API Key** — leave blank for keyless local servers
- **Model** — type a model name or click **Load Models** to fetch from `/models`

Click **Test** to verify the connection, then select the provider from the header dropdown to make it active. Settings persist in `localStorage`.

### Env-var prefill (optional)

Copy `.env.example` to `.env`. The server reads these on startup and sends them to the UI as hints (via `GET /api/env-hints`) to prefill the config modal. The `.env.example` file is the authoritative reference; key variables:

```env
ACTIVE_PROVIDER=          # openai | openrouter | ollama | vllm | llamacpp | custom

OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o

OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o

OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.2-vision

VLLM_BASE_URL=http://localhost:8001/v1
LLAMACPP_BASE_URL=http://localhost:8080/v1

GEN_TEMPERATURE=0.7
GEN_TOP_P=0.9
GEN_MAX_TOKENS=4096

# Optional prompt overrides (leave blank to use built-in defaults)
BASE_IMAGE_PROMPT=
BASE_STYLE_PROMPT=
BASE_ARTIST_PROMPT=
BASE_PROMPT_GENERATION=
BASE_FLUX_PROMPT=
BASE_SDXL_PROMPT=
```

---

## 🖼️ How It Works

The workflow is a five-step pipeline — each step feeds the next:

1. **Analyze image** — upload a file; the backend preprocesses it with `sharp`, base64-encodes it, and sends it to the vision model via `image_url`. The result is a detailed visual description.
2. **Describe art style** — given the chosen artistic movement, the model generates a style description (lighting, composition, palette, technique).
3. **Recommend artist** — the model recommends an artist whose style fits the selected movement and the image context.
4. **Generate Flux/T5 prompt** — combines image description + style description + artist recommendation into a T5-aware long-form prompt optimized for Flux.
5. **Generate SDXL prompt** — produces a more tag-structured prompt in SDXL/Stable Diffusion convention.

Each step has its own **Generate** button so you can re-roll any stage independently.

---

## 📁 Project Structure

```
js-app/
├── index.html                   # Vite entry HTML
├── vite.config.mjs              # Vite + React plugin config, /api proxy
├── postcss.config.cjs           # PostCSS for Mantine
├── package.json
├── Dockerfile                   # Multi-stage build (node:24-bookworm-slim)
├── docker-compose.yml           # Exposes host:7633 → container:8000
├── .env.example                 # Env-var reference / prefill template
├── src/
│   ├── main.jsx                 # React entry, MantineProvider, theme
│   └── ui/
│       └── App.jsx              # Full SPA — all UI components
└── server/
    ├── index.js                 # Express 5 API server
    └── config.json              # Built-in prompt defaults
```

---

## 📡 API Endpoints

All endpoints are under `/api`. The UI communicates exclusively through these.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/config` | Server config + health check |
| `GET` | `/api/env-hints` | Provider settings prefilled from env vars |
| `POST` | `/api/models` | Fetch model list from a provider's `/models` |
| `POST` | `/api/test` | Test connectivity to a provider |
| `POST` | `/api/analyze-image` | Vision analysis of an uploaded image (multipart) |
| `POST` | `/api/generate-style-description` | Art style description for a given movement |
| `POST` | `/api/recommend-artist` | Artist recommendation for a style + context |
| `POST` | `/api/generate-prompt` | General combined prompt |
| `POST` | `/api/generate-flux-prompt` | Flux/T5 optimised prompt |
| `POST` | `/api/generate-sdxl-prompt` | SDXL/SD tag-structured prompt |

---

## 🔒 Security

- **Helmet** for standard HTTP security headers (CSP intentionally disabled — Mantine's CSS-in-JS requires inline styles)
- **Rate limiting** via `express-rate-limit` on all `/api` routes
- **In-memory uploads** — `multer` holds the image buffer in RAM; nothing is written to disk
- **Non-root container user** and **read-only root filesystem** in Docker; writable `/tmp` via `tmpfs` for Node internals
- `no-new-privileges` security option in compose

---

## 🏗️ Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Mantine 8, Tabler Icons, Vite 7 |
| Backend | Node 24, Express 5, multer 2, sharp 0.34 |
| LLM transport | Native `fetch` — OpenAI-compatible REST |
| Container | Docker multi-stage, `node:24-bookworm-slim` |
| Dev tooling | Vite HMR, nodemon, concurrently, PostCSS |

---

## 📄 License

MIT — see [`../LICENSE`](../LICENSE).
