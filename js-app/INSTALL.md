# Installation & Setup

## Prerequisites

You need **one** of:

- **Docker + Docker Compose** — recommended, no Node install required on the host
- **Node.js >= 20** — for local dev or production-style local run

You also need a **reachable OpenAI-compatible LLM endpoint** — cloud (OpenAI, OpenRouter) or local (Ollama, vLLM, llama.cpp). You can configure the endpoint entirely in the UI after startup; no env file is strictly required.

---

## Docker Install

```bash
# 1. (Optional) copy the env template to prefill provider settings in the UI
cp .env.example .env
# Edit .env to add your Base URLs / API keys — or skip and configure in the UI

# 2. Build and start
docker compose up --build -d

# 3. Open the app
#    http://localhost:7633

# Useful compose commands
docker compose logs -f          # tail logs
docker compose down             # stop and remove container
docker compose up --build -d    # rebuild after a code change
```

The app is served on host port **7633** (mapped to container port 8000).

### Configuring providers in the UI

1. Open <http://localhost:7633>.
2. Click the **⚙️ gear icon** in the header to open AI Configuration.
3. For each provider you want to use, enter the Base URL, API Key (if required), and Model name.
4. Click **Load Models** to auto-populate the model dropdown from the server's `/models` endpoint, or type a model name directly.
5. Click **Test** to verify the connection.
6. Use the **provider dropdown** in the header to select the active provider.
7. Settings are saved automatically in your browser's `localStorage`.

### Reaching a local LLM from Docker

When the LLM server runs on your host machine, `localhost` inside the container resolves to the container itself, not the host. Use `host.docker.internal` instead:

```text
http://host.docker.internal:11434/v1   # Ollama
http://host.docker.internal:8001/v1    # vLLM
http://host.docker.internal:8080/v1    # llama.cpp
```

The compose file already maps `host.docker.internal` via `extra_hosts: host-gateway`, so no extra configuration is needed on Linux.

---

## Local Dev Install

```bash
# From the js-app directory
npm install

# Development mode — Vite HMR on :5173, Express API on :8000 (/api proxied by Vite)
npm run dev

# Production-style — build the SPA, then serve everything from Express on :8000
npm run build
npm start
```

In dev mode the app is at **<http://localhost:5173>**. In production-style mode it is at **<http://localhost:8000>**.

---

## Provider Quick Recipes

These are the exact values to enter in the UI's AI Configuration modal.

### OpenAI

- **Base URL:** `https://api.openai.com/v1`
- **API Key:** your `sk-…` key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Model:** `gpt-4o` (or any vision-capable model for image analysis)

### OpenRouter

- **Base URL:** `https://openrouter.ai/api/v1`
- **API Key:** your key from [openrouter.ai](https://openrouter.ai)
- **Model:** e.g. `openai/gpt-4o` or any vision-capable model listed on OpenRouter

### Ollama

```bash
# Install Ollama, then pull a vision model
ollama pull llama3.2-vision
# The server starts automatically; confirm it's running
ollama serve
```

- **Base URL:** `http://localhost:11434/v1` (local) or `http://host.docker.internal:11434/v1` (from Docker)
- **API Key:** leave blank
- **Model:** `llama3.2-vision` (or whatever you pulled)

### vLLM

```bash
vllm serve <your-model-name> --port 8001
```

- **Base URL:** `http://localhost:8001/v1` (local) or `http://host.docker.internal:8001/v1` (from Docker)
- **API Key:** leave blank (add `--api-key <token>` to vllm serve if you want auth)
- **Model:** the model name you passed to `vllm serve`

### llama.cpp

```bash
llama-server -m /path/to/model.gguf --port 8080
```

- **Base URL:** `http://localhost:8080/v1` (local) or `http://host.docker.internal:8080/v1` (from Docker)
- **API Key:** leave blank
- **Model:** the filename or whatever the server reports — use **Load Models** to discover it

---

## Troubleshooting

### "No provider configured" or requests immediately fail

The UI needs a Base URL and a Model set for the active provider. Open ⚙️ AI Configuration, fill in both fields, and click **Test**.

### Can't reach a local LLM from inside Docker

Replace `localhost` with `host.docker.internal` in the Base URL. See the [Docker section](#reaching-a-local-llm-from-docker) above.

### Image analysis returns an error or garbled output

The selected model is not vision-capable. Switch to a model that accepts image inputs (e.g. `gpt-4o`, `llama3.2-vision`, a multimodal vLLM deployment). Text-only models cannot process the `image_url` content type.

### Port 7633 is already in use (Docker)

Edit `docker-compose.yml` and change the host side of the port mapping:

```yaml
ports:
  - "7634:8000"   # use any free host port
```

Then `docker compose up -d` to apply.

### Port 5173 or 8000 is already in use (local dev)

Set `PORT=<other>` in your `.env` for the Express server, or pass `--port <other>` to Vite via `package.json` if you need to change the Vite port.

### `npm install` fails on `sharp`

`sharp` uses native binaries. Ensure you are on Node >= 20 and that build tools are available (`python`, `make`, `gcc` / MSVC on Windows). On Windows the easiest fix is installing the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
