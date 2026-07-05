# 🎨 Art Style Fusion Prompt Engineer

A containerized, single-page web app for composing rich text-to-image prompts by fusing AI image analysis, an art-style description, and an optional artist recommendation into **Flux/T5** and **SDXL** prompts.

It talks to **any OpenAI-compatible LLM backend** — OpenAI, OpenRouter, Ollama, vLLM, llama.cpp, or any custom endpoint — with no provider lock-in.

> The application lives in **[`js-app/`](js-app/)**. See **[`js-app/README.md`](js-app/README.md)** for the full feature, configuration, API, and security documentation. This page is a high-level overview.

## 🚀 Quick Start (Docker)

```bash
git clone https://github.com/ergonomech/Art-Style-Fusion-Prompt-Enginner.git
cd Art-Style-Fusion-Prompt-Enginner/js-app

cp .env.example .env          # optional — you can configure everything in the UI instead
docker compose up --build -d
```

Open **<http://localhost:7633>**, click the ⚙️ gear in the header, and configure a provider (Base URL such as `https://api.openai.com/v1`, an API key if required, and a model). Pointing at an LLM on your host machine? Use `http://host.docker.internal:<port>/v1`.

## 🧰 Local development

**Node ≥ 20.** From `js-app/`:

```bash
npm install
npm run dev      # Vite dev server on :5173 (proxies /api → Express :8000)
# or, production-style:
npm run build && npm start   # Express serves the built SPA + API on :8000
```

## 🎯 Features

- Reconstruction-grade image analysis via a vision model (or write a manual description)
- Art-style description generation for any movement
- **Optional** artist recommendation — clear it or skip it; prompts generate without it
- Flux/T5 and SDXL prompt generation
- **Editable** outputs (each step feeds the next), with per-output copy / download / clear, word counts, and stale-output warnings
- **Per-section output history** and **prompt presets + version history** — browser-only, never sent to the server
- Runtime provider switching in the UI; settings + session persist in `localStorage`
- Dark-themed React 19 + Mantine 8 UI

## 🏗️ Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Mantine 8, Vite 7 |
| Backend | Node 24, Express 5, `sharp`, `multer`, native `fetch` |
| Transport | OpenAI-compatible REST (`/chat/completions`, `/models`) |
| Container | Docker multi-stage, `node:24-bookworm-slim` |

## 📁 Repository layout

```text
Art-Style-Fusion-Prompt-Enginner/
├── js-app/            # The application (React SPA + Express API + Docker)
│   ├── src/           # React 19 + Mantine frontend
│   ├── server/        # Express 5 API (generic OpenAI-compatible backend)
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── README.md      # Full documentation
├── README.md          # This overview
└── LICENSE            # MIT
```

## 🔞 / 🔒 Notes

This is an **adults-only**, **single-user / trusted-network** tool. The default image-analysis prompt describes mature/explicit content factually and excludes watermarks and logos; the server has open CORS and no authentication, and provider API keys are stored in the browser's `localStorage`. Read the **[Security & honest caveats](js-app/README.md#-security--honest-caveats)** section before exposing it beyond localhost.

## 📄 License

MIT — see [LICENSE](LICENSE).
