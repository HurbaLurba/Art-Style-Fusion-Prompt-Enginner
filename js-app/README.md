# 🎨 Art Style Fusion Prompt Engineer

A single-page web app that helps you compose rich, production-ready text-to-image prompts by fusing AI-powered image analysis, an art-style description, and an optional artist recommendation into both **Flux/T5** and **SDXL** prompt formats.

Works against **any OpenAI-compatible LLM backend** — cloud or local — with zero provider lock-in.

**Features at a glance:**

- Upload an image (or write a manual description) and extract a detailed, reconstruction-grade visual description via a vision model
- Generate an art-style description for any artistic movement
- Optionally get an artist recommendation that fits the chosen style — **or skip it entirely**
- Produce a Flux/T5 prompt and an SDXL prompt from those inputs
- **Every output is editable** — hand-tune any step before it feeds the next
- Per-output **Copy**, **Download (.txt)**, and **Clear** buttons; **word counts** with cap warnings on Flux/SDXL
- **Stale badges** warn you when an upstream change leaves a downstream output out of date
- **Per-section output history** — every generation is kept in your browser; browse, preview, restore, or delete past outputs per section
- **Prompt presets & version history** — save named, reusable prompt-engineering presets and auto-snapshot prior versions so you can revert
- Switch providers in the UI at runtime — no restarts required
- Session state (text + processed image) persists in `localStorage`
- Dark-themed React UI, fully responsive

---

## 🔌 Supported AI Backends

The server calls `{baseUrl}/chat/completions` and `{baseUrl}/models` — the standard OpenAI API shape. Any compliant server works.

| Provider | Example Base URL | API Key Required? | Notes |
| --- | --- | --- | --- |
| **OpenAI** | `https://api.openai.com/v1` | Yes | `gpt-4o` is the default model |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Yes | One key, many models; the picker lists only vision (image→text) models |
| **Ollama** | `http://localhost:11434/v1` | No | Run `ollama pull llama3.2-vision` for vision |
| **vLLM** | `http://localhost:8001/v1` | No | Serve with `vllm serve <model>` |
| **llama.cpp** | `http://localhost:8080/v1` | No | Run `llama-server -m model.gguf --port 8080` |
| **Custom** | Any OpenAI-compatible URL | Optional | Must include the `/v1` path segment |

> **Image analysis** requires a vision-capable model (one that accepts `image_url` content). Text-only models will fail on the analyze step but work fine for every other step.
>
> **Running in Docker and pointing at a local LLM?** Use `http://host.docker.internal:<port>/v1` instead of `localhost` — the compose file already adds the `host-gateway` mapping.

### 🔞 About the default image-analysis prompt

This is an **adults-only** tool. The built-in image-analysis prompt is a *reconstruction-grade describer*: it instructs the vision model to describe the image as a blueprint for recreating it from text alone. Specifically, the default prompt:

- Describes mature, suggestive, or **sexually explicit** content **factually and without refusal**, and treats every depicted person as an adult.
- **Excludes** watermarks, logos, signatures, captions, usernames, site names, and other overlaid text/graphics, so recreations come out clean (text that is genuinely part of the scene is still described).
- Targets a complete description **under roughly 4000 tokens** (stated in the prompt; the endpoint raises the output ceiling to 8192 so it isn't cropped — it is *not* a hard cap).

You can replace this prompt entirely with the `BASE_IMAGE_PROMPT` environment variable. The model you point at must itself be willing to produce such descriptions — the app does not bypass a provider's content policy.

---

## 🚀 Quick Start — Docker

```bash
# Optional: prefill provider config from env vars
cp .env.example .env
# Edit .env if you want env-var prefill — or configure entirely in the UI

docker compose up --build -d
```

Open **<http://localhost:7633>**, click the ⚙️ gear icon in the header, fill in your provider's Base URL, API Key (if needed), and Model, then hit **Test** to verify connectivity. Use the provider dropdown in the header to choose the active provider.

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

> In dev, the Vite server (`:5173`) is the one you open; it proxies `/api/*` to Express on `:8000`. In production there is only Express on `:8000` (mapped to host `:7633` by compose), serving the built `dist/` plus the API.

---

## ⚙️ Configuration

### UI config flow (primary)

Open the **⚙️ AI Configuration** modal in the header. For each of the six providers you can enter:

- **Base URL** — must include the `/v1` segment (e.g. `https://api.openai.com/v1`)
- **API Key** — leave blank for keyless local servers
- **Model** — type a model name, or click **Load models** to fetch the list from `{baseUrl}/models`

Click **Test** to verify the connection, then choose the active provider from the **Active provider** dropdown (header or modal). Settings persist in `localStorage`. A provider is considered *ready* once its Base URL and Model are set (plus an API key when the provider requires one); if the active provider isn't ready, the config modal opens automatically on load.

The settings modal also lets you:

- **Tune generation parameters** — temperature, top-p, max tokens, and the optional **top-k** / **min-p** samplers. `top_k`/`min_p` are sent only when set; OpenRouter, vLLM, llama.cpp and Ollama accept them, while OpenAI does not. **If a provider rejects them, the server transparently drops them and retries** — the request still succeeds, and the result's meta line notes `top_k+min_p ignored`.
- **Edit the per-step base prompts** under **Prompt engineering** (image analysis, art style, artist, Flux, SDXL). Overrides are stored with your settings and sent per request; **Load default into editor** populates the built-in text for editing, and **Reset to default** clears the override. Resolution order is per-session override → env var → built-in default.
- **Save prompt presets and browse version history** per field. **Save as preset** names the current prompt for reuse; the **Presets** menu loads a saved preset or the pinned *Default (built-in)*; the **History** menu lists auto-snapshots of prior prompt versions (taken when you Save changes) so you can revert. All stored in your browser, independent of the rest of settings.

### Env-var prefill (optional)

Copy `.env.example` to `.env`. The server reads these on startup and exposes them to the UI as hints (via `GET /api/env-hints`) to prefill the config modal **without overwriting values you've already set**. `.env.example` is the authoritative reference; key variables:

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
GEN_TOP_K=                 # optional; dropped automatically if the provider rejects it
GEN_MIN_P=                 # optional; dropped automatically if unsupported

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

The workflow is a pipeline where each output feeds the next — but **every generated output is an editable text box**, so you can correct or rewrite any step by hand before it flows downstream.

1. **Image analysis** — drag in an image (resized client-side to ~1MP JPEG, then re-processed server-side with `sharp` and sent to the vision model via `image_url`) **or** type a *Manual description* and click **Use Manual Description**. Produces the reconstruction-grade description covered above.
2. **Art style** — type or pick an artistic movement, then generate a style description (lighting, composition, palette, technique).
3. **Artist recommendation — *optional*** — generate an artist that fits the style and image context, edit it, or clear it. **Flux/SDXL generate fine without it**: when artist is empty the server omits it from the prompt entirely (no dangling label).
4. **Flux/T5 prompt** — combines the image description, style description, and (if present) artist into a T5-aware long-form prompt for Flux. Enabled once you have a style and an image/manual description. Server-capped to ≤512 words.
5. **SDXL prompt** — converts the Flux prompt into a tighter SDXL-convention prompt. Enabled once a Flux prompt exists. Server-capped to ≤256 words.

Each step has its own **Generate** button so you can re-roll any stage independently. Editing an upstream field after generating a downstream output marks that output **stale** (yellow badge) so you remember to regenerate. Failures surface as a red alert and **never overwrite** your existing output.

### 🕘 Output history (browser-only)

Every generation is appended to a **per-section history** kept only in your browser (never sent to or stored on the server). Each output panel gets a **History** button (with a count badge) to:

- **Browse** past outputs for that section with relative timestamps, model, and word count
- **Preview** a full entry (handy for a large image analysis) in a read-only modal
- **Restore** an entry back into the editor (your current unsaved edit is snapshotted first, so nothing is lost)
- **Delete** a single entry or **Clear** the section's history

History is capped per section and quota-safe: if browser storage is full it degrades to "not recorded" and never breaks a generation. The regular per-section **Clear** and **Clear All** buttons do **not** wipe history — it's your safety net.

---

## 📁 Project Structure

```text
js-app/
├── index.html                   # Vite entry HTML
├── vite.config.mjs              # Vite + React plugin config, /api proxy
├── postcss.config.cjs           # PostCSS for Mantine
├── package.json                 # React/Mantine/Vite are devDependencies (bundled, not run)
├── Dockerfile                   # Multi-stage build (node:24-bookworm-slim)
├── docker-compose.yml           # Exposes host:7633 → container:8000
├── .dockerignore
├── .env.example                 # Env-var reference / prefill template
├── src/
│   ├── main.jsx                 # React 19 entry, MantineProvider, theme
│   └── ui/
│       ├── App.jsx              # Full SPA — all UI components
│       └── historyStore.js      # Browser-only output history + prompt-preset store (quota-safe)
└── server/
    ├── index.js                 # Express 5 API server
    └── config.json              # Built-in art-style list + generation defaults
```

> React, Mantine, and Tabler Icons live under `devDependencies` on purpose: they are bundled into `dist/` at build time and are **not** needed at runtime, which keeps the production image lean (`npm ci --omit=dev` skips them).

---

## 📡 API Endpoints

All endpoints are under `/api`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/config` | Art-style list, generation defaults, and provider presets |
| `GET` | `/api/env-hints` | Provider values supplied via env vars (for UI prefill) |
| `POST` | `/api/models` | Fetch a provider's model list (`{ baseUrl, apiKey }`) |
| `POST` | `/api/test` | Test connectivity to a provider (`{ baseUrl, apiKey }`) |
| `POST` | `/api/analyze-image` | Vision analysis of an uploaded image (multipart: `image` + `settings`) |
| `POST` | `/api/generate-style-description` | Art-style description for a given movement |
| `POST` | `/api/recommend-artist` | Artist recommendation for a style + context |
| `POST` | `/api/generate-flux-prompt` | Flux/T5-optimised prompt (≤512 words) |
| `POST` | `/api/generate-sdxl-prompt` | SDXL/SD tag-structured prompt (≤256 words) |
| `POST` | `/api/generate-prompt` | General combined prompt — available but **not used by the current UI** |

All generation endpoints accept the UI's `settings` object and resolve the provider as **user settings → environment → preset default**.

---

## 🔒 Security & honest caveats

This app is designed for **personal, single-user, trusted (typically localhost) use**. Be deliberate before exposing it to a network.

- **Helmet** sets standard HTTP security headers, but **CSP is intentionally disabled** because Mantine's theme injects inline styles.
- **CORS is wide open** (`cors()` with no allowlist) and **there is no authentication**. Anyone who can reach the server can drive its endpoints.
- **API keys are stored in the browser's `localStorage`** and are POSTed to this server, which forwards them to the chosen provider. They are not encrypted at rest in the browser.
- `/api/test` and `/api/models` fetch **any Base URL you give them, server-side** — a deliberate feature (testing arbitrary endpoints), but also an SSRF vector if the server is exposed to untrusted callers.
- **Rate limiting** (`express-rate-limit`) is applied to all `/api` routes.
- **Uploads are in-memory** (`multer` memory storage, 10 MB image-only limit) — nothing is written to disk.
- **Minimal, privacy-preserving server logging** — the stateless server logs only short error scopes/messages, never request bodies, prompts, image data, generated outputs, or API keys.
- **History is browser-only** — output history and prompt presets live entirely in your browser's `localStorage` (under `asf:*` keys) and are never sent to or stored on the server.
- In Docker: **non-root user**, **read-only root filesystem**, writable `/tmp` via `tmpfs`, and `no-new-privileges`.

---

## 🏗️ Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Mantine 8 (+ dropzone, notifications), Tabler Icons, Vite 7 |
| Backend | Node 24, Express 5, multer 2, sharp 0.34, helmet 8 |
| LLM transport | Native `fetch` — OpenAI-compatible REST (`/chat/completions`, `/models`) |
| Container | Docker multi-stage, `node:24-bookworm-slim` |
| Dev tooling | Vite HMR, nodemon, concurrently, PostCSS |

---

## 📄 License

MIT — see [`../LICENSE`](../LICENSE).
