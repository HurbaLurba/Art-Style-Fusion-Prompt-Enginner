import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  AppShell,
  Autocomplete,
  Box,
  Button,
  Card,
  Container,
  CopyButton,
  Divider,
  Group,
  Image,
  Loader,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Dropzone, IMAGE_MIME_TYPE } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import {
  IconBolt,
  IconBrush,
  IconCheck,
  IconCopy,
  IconDownload,
  IconPhoto,
  IconRefresh,
  IconSettings,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconUser,
  IconX,
} from '@tabler/icons-react'

const SETTINGS_KEY = 'artStyleFusionSettings'
const SESSION_KEY = 'artStyleFusionSession'

// The six providers the UI always renders. Presets from /api/config are merged
// on top of these so server-supplied labels/baseUrls/defaultModels win.
const PROVIDER_FALLBACK = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', needsKey: true, defaultModel: '' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, defaultModel: '' },
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', needsKey: false, defaultModel: '' },
  { id: 'vllm', label: 'vLLM', baseUrl: 'http://localhost:8000/v1', needsKey: false, defaultModel: '' },
  { id: 'llamacpp', label: 'llama.cpp', baseUrl: 'http://localhost:8080/v1', needsKey: false, defaultModel: '' },
  { id: 'custom', label: 'Custom', baseUrl: '', needsKey: false, defaultModel: '' },
]

const DEFAULT_GENERATION = { temperature: 0.7, top_p: 0.9, max_tokens: 4096 }

const emptyProvider = () => ({ baseUrl: '', apiKey: '', model: '' })

function blankSettings() {
  const providers = {}
  for (const p of PROVIDER_FALLBACK) providers[p.id] = emptyProvider()
  return {
    activeProvider: 'openai',
    providers,
    generation: { ...DEFAULT_GENERATION },
  }
}

// ---- localStorage helpers ----------------------------------------------------

const Storage = {
  read() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    } catch {
      return null
    }
  },
  write(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
    } catch {
      /* ignore quota errors */
    }
  },
}

const Session = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')
    } catch {
      return {}
    }
  },
  save(data) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(data))
    } catch {
      /* ignore quota errors */
    }
  },
  clear() {
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  },
}

// Normalize whatever is in localStorage into the new schema, migrating the old
// flat keys if present. Always returns a fully-formed settings object.
function loadAndMigrateSettings() {
  const raw = Storage.read()

  // Detect the old flat schema (any of its hallmark keys present).
  const isLegacy =
    raw &&
    (raw.openai_api_key !== undefined ||
      raw.openai_model !== undefined ||
      raw.openrouter_api_key !== undefined ||
      raw.openrouter_model !== undefined ||
      raw.ollama_base_url !== undefined ||
      raw.ollama_model !== undefined ||
      raw.provider !== undefined) &&
    !raw.providers

  if (isLegacy) {
    const next = blankSettings()
    next.providers.openai = {
      baseUrl: '',
      apiKey: raw.openai_api_key || '',
      model: raw.openai_model || '',
    }
    next.providers.openrouter = {
      baseUrl: '',
      apiKey: raw.openrouter_api_key || '',
      model: raw.openrouter_model || '',
    }
    next.providers.ollama = {
      baseUrl: raw.ollama_base_url || '',
      apiKey: '',
      model: raw.ollama_model || '',
    }
    if (raw.provider && next.providers[raw.provider]) {
      next.activeProvider = raw.provider
    }
    Storage.write(next)
    return next
  }

  if (raw && raw.providers) {
    // Ensure all six providers and a generation block exist.
    const merged = blankSettings()
    merged.activeProvider = raw.activeProvider || merged.activeProvider
    merged.generation = { ...DEFAULT_GENERATION, ...(raw.generation || {}) }
    for (const id of Object.keys(merged.providers)) {
      merged.providers[id] = { ...emptyProvider(), ...(raw.providers[id] || {}) }
    }
    return merged
  }

  return blankSettings()
}

// A provider is "ready" when baseUrl && model are set; apiKey only required
// when the matching preset marks needsKey.
function providerReady(settings, presets, id) {
  const p = settings.providers?.[id]
  if (!p) return false
  const preset = presets.find((x) => x.id === id)
  const needsKey = preset ? preset.needsKey : false
  const hasBase = Boolean((p.baseUrl || preset?.baseUrl || '').trim())
  const hasModel = Boolean((p.model || '').trim())
  const hasKey = needsKey ? Boolean((p.apiKey || '').trim()) : true
  return hasBase && hasModel && hasKey
}

function anyProviderReady(settings, presets) {
  return presets.some((p) => providerReady(settings, presets, p.id))
}

// ---- App ---------------------------------------------------------------------

export default function App() {
  const [settings, setSettings] = useState(loadAndMigrateSettings)
  const [presets, setPresets] = useState(PROVIDER_FALLBACK)
  const [artStyles, setArtStyles] = useState([])
  const [genDefaults, setGenDefaults] = useState(DEFAULT_GENERATION)
  const [settingsOpened, settingsModal] = useDisclosure(false)
  // Per-provider model option lists: { [id]: [{value,label}] }
  const [modelOptions, setModelOptions] = useState({})

  // Workflow state
  const [file, setFile] = useState(null)
  const [processedImageUrl, setProcessedImageUrl] = useState(null)
  const [imageProcessing, setImageProcessing] = useState(false)
  const [manual, setManual] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [style, setStyle] = useState('')
  const [styleDesc, setStyleDesc] = useState('')
  const [artist, setArtist] = useState('')
  const [custom, setCustom] = useState('')
  const [flux, setFlux] = useState('')
  const [sdxl, setSdxl] = useState('')
  const [meta, setMeta] = useState({ analysis: null, style: null, artist: null, flux: null, sdxl: null })

  const [busy, setBusy] = useState({ analyze: false, style: false, artist: false, flux: false, sdxl: false })

  const restoredRef = useRef(false)
  const saveTimer = useRef(null)

  const ready = useMemo(() => anyProviderReady(settings, presets), [settings, presets])

  const persist = (next) => {
    setSettings(next)
    Storage.write(next)
  }

  const setActiveProvider = (id) => {
    if (!id) return
    persist({ ...settings, activeProvider: id })
  }

  // ---- mount: config, env hints, session restore ----------------------------
  useEffect(() => {
    let mounted = true

    // /api/config -> presets, generation defaults, art styles
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        if (!mounted) return
        if (Array.isArray(cfg.providerPresets) && cfg.providerPresets.length) {
          // Merge server presets over the fallback so we always have all six.
          const byId = Object.fromEntries(PROVIDER_FALLBACK.map((p) => [p.id, p]))
          for (const sp of cfg.providerPresets) {
            byId[sp.id] = { ...(byId[sp.id] || {}), ...sp }
          }
          setPresets(Object.values(byId))
        }
        if (Array.isArray(cfg.artStyles)) setArtStyles(cfg.artStyles)
        if (cfg.generation) {
          const g = {
            temperature: cfg.generation.temperature ?? DEFAULT_GENERATION.temperature,
            top_p: cfg.generation.top_p ?? DEFAULT_GENERATION.top_p,
            max_tokens: cfg.generation.max_tokens ?? cfg.generation.token_limit ?? DEFAULT_GENERATION.max_tokens,
          }
          setGenDefaults(g)
        }
      })
      .catch(() => {})

    // /api/env-hints -> prefill provider fields WITHOUT overwriting user values
    fetch('/api/env-hints')
      .then((r) => r.json())
      .then((hints) => {
        if (!mounted || !hints) return
        const current = loadAndMigrateSettings()
        const next = { ...current, providers: { ...current.providers } }
        let changed = false
        const envProviders = hints.providers || {}
        for (const id of Object.keys(next.providers)) {
          const envP = envProviders[id]
          if (!envP) continue
          const cur = { ...next.providers[id] }
          if (envP.baseUrl && !cur.baseUrl) {
            cur.baseUrl = envP.baseUrl
            changed = true
          }
          if (envP.apiKey && !cur.apiKey) {
            cur.apiKey = envP.apiKey
            changed = true
          }
          if (envP.model && !cur.model) {
            cur.model = envP.model
            changed = true
          }
          next.providers[id] = cur
        }
        if (hints.activeProvider && next.providers[hints.activeProvider] && !current.activeProvider) {
          next.activeProvider = hints.activeProvider
          changed = true
        }
        if (changed) {
          persist(next)
        }
      })
      .catch(() => {})

    // Restore prior session (content + image)
    const sess = Session.load()
    if (sess && !restoredRef.current) {
      if (sess.manual) setManual(sess.manual)
      if (sess.analysis) setAnalysis(sess.analysis)
      if (sess.style) setStyle(sess.style)
      if (sess.styleDesc) setStyleDesc(sess.styleDesc)
      if (sess.artist) setArtist(sess.artist)
      if (sess.custom) setCustom(sess.custom)
      if (sess.flux) setFlux(sess.flux)
      if (sess.sdxl) setSdxl(sess.sdxl)
      if (sess.imageDataUrl) {
        fetch(sess.imageDataUrl)
          .then((r) => r.blob())
          .then((blob) => {
            const f = new File([blob], sess.imageName || 'session-image.jpg', {
              type: sess.imageType || blob.type || 'image/jpeg',
            })
            if (mounted) {
              setFile(f)
              setProcessedImageUrl(sess.imageDataUrl)
            }
          })
          .catch(() => {})
      }
      restoredRef.current = true
    } else {
      restoredRef.current = true
    }

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-open settings if nothing is ready (after presets load too).
  useEffect(() => {
    if (!ready && !settingsOpened) {
      settingsModal.open()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // ---- debounced session save -----------------------------------------------
  useEffect(() => {
    if (!restoredRef.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const data = { manual, analysis, style, styleDesc, artist, custom, flux, sdxl }
      if (processedImageUrl && processedImageUrl.startsWith('data:')) {
        data.imageDataUrl = processedImageUrl
        if (file?.name) data.imageName = file.name
        data.imageType = 'image/jpeg'
      }
      Session.save(data)
    }, 400)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [manual, analysis, style, styleDesc, artist, custom, flux, sdxl, processedImageUrl, file])

  // ---- image processing (preserved canvas logic) ----------------------------
  const processImage = (imageFile) => {
    return new Promise((resolve) => {
      setImageProcessing(true)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new window.Image()
      img.onload = () => {
        try {
          const targetPixels = 1000000
          const currentPixels = img.width * img.height
          const ratio = Math.sqrt(targetPixels / currentPixels)
          const newWidth = Math.round(img.width * ratio)
          const newHeight = Math.round(img.height * ratio)
          canvas.width = newWidth
          canvas.height = newHeight
          ctx.drawImage(img, 0, 0, newWidth, newHeight)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
          canvas.toBlob(
            (blob) => {
              const processedName =
                imageFile && imageFile.name ? `processed-${imageFile.name}` : 'processed-image.jpg'
              const processedFile = new File([blob], processedName, { type: 'image/jpeg' })
              setProcessedImageUrl(dataUrl)
              setImageProcessing(false)
              if (dataUrl.length < 4 * 1024 * 1024) {
                const session = Session.load()
                session.imageDataUrl = dataUrl
                session.imageName = processedName
                session.imageType = 'image/jpeg'
                Session.save(session)
              }
              resolve(processedFile)
            },
            'image/jpeg',
            0.85
          )
        } catch (e) {
          console.error('Image processing error', e)
          setImageProcessing(false)
          resolve(imageFile)
        }
      }
      img.onerror = () => {
        setImageProcessing(false)
        resolve(imageFile)
      }
      const reader = new FileReader()
      reader.onload = () => {
        img.src = reader.result
      }
      reader.onerror = () => {
        setImageProcessing(false)
        resolve(imageFile)
      }
      reader.readAsDataURL(imageFile)
    })
  }

  const handleDrop = async (files) => {
    const selected = files?.[0]
    if (!selected) return
    try {
      const processed = await processImage(selected)
      setFile(processed)
    } catch (e) {
      console.error('Image processing failed:', e)
      setFile(selected)
      setImageProcessing(false)
    }
  }

  // ---- API calls ------------------------------------------------------------
  const withBusy = (key, fn) => async () => {
    setBusy((b) => ({ ...b, [key]: true }))
    try {
      await fn()
    } finally {
      setBusy((b) => ({ ...b, [key]: false }))
    }
  }

  const analyze = withBusy('analyze', async () => {
    try {
      const form = new FormData()
      form.append('settings', JSON.stringify(settings))
      form.append('image', file)
      const res = await fetch('/api/analyze-image', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setAnalysis(data.analysis)
      setMeta((m) => ({ ...m, analysis: data.meta || null }))
    } catch (e) {
      setAnalysis(`Error: ${e.message}`)
    }
  })

  const useManual = () => setAnalysis(manual)

  const genStyle = withBusy('style', async () => {
    try {
      const res = await fetch('/api/generate-style-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style, settings }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setStyleDesc(data.description)
      setMeta((m) => ({ ...m, style: data.meta || null }))
    } catch (e) {
      setStyleDesc(`Error: ${e.message}`)
    }
  })

  const genArtist = withBusy('artist', async () => {
    try {
      const res = await fetch('/api/recommend-artist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style,
          styleDescription: styleDesc,
          imageDescription: analysis,
          themes: custom,
          settings,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setArtist(data.recommendation || data.artist)
      setMeta((m) => ({ ...m, artist: data.meta || null }))
    } catch (e) {
      setArtist(`Error: ${e.message}`)
    }
  })

  const genFlux = withBusy('flux', async () => {
    try {
      const res = await fetch('/api/generate-flux-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style,
          styleDescription: styleDesc,
          imageDescription: analysis,
          artistRecommendation: artist,
          customInputs: custom,
          settings,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setFlux(data.prompt)
      setMeta((m) => ({ ...m, flux: data.meta || null }))
    } catch (e) {
      setFlux(`Error: ${e.message}`)
    }
  })

  const genSdxl = withBusy('sdxl', async () => {
    try {
      const res = await fetch('/api/generate-sdxl-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fluxPrompt: flux, settings }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setSdxl(data.prompt)
      setMeta((m) => ({ ...m, sdxl: data.meta || null }))
    } catch (e) {
      setSdxl(`Error: ${e.message}`)
    }
  })

  // ---- Clear all -------------------------------------------------------------
  const clearAll = () => {
    if (!window.confirm('Clear all generated content and image? Settings will be kept.')) return
    setFile(null)
    setProcessedImageUrl(null)
    setManual('')
    setAnalysis('')
    setStyle('')
    setStyleDesc('')
    setArtist('')
    setCustom('')
    setFlux('')
    setSdxl('')
    setMeta({ analysis: null, style: null, artist: null, flux: null, sdxl: null })
    Session.clear()
  }

  const providerSelectData = presets.map((p) => ({ value: p.id, label: p.label }))

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container size="md" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <ThemeIcon variant="gradient" gradient={{ from: 'violet', to: 'grape', deg: 135 }} radius="md" size="lg">
                <IconBrush size={20} />
              </ThemeIcon>
              <Title order={4} fw={700}>
                Art Style Fusion
              </Title>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Select
                size="xs"
                w={150}
                data={providerSelectData}
                value={settings.activeProvider}
                onChange={setActiveProvider}
                allowDeselect={false}
                aria-label="Active provider"
                comboboxProps={{ withinPortal: true }}
              />
              <Tooltip label="Clear all generated content">
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  leftSection={<IconTrash size={16} />}
                  onClick={clearAll}
                >
                  Clear All
                </Button>
              </Tooltip>
              <Tooltip label="AI Configuration">
                <ActionIcon size="lg" variant="default" onClick={settingsModal.open} aria-label="AI Configuration">
                  <IconSettings size={20} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="md" pb="xl">
          <Stack gap="lg">
            <Box>
              <Title order={1} fw={800}>
                Create rich prompts
              </Title>
              <Text c="dimmed" mt={4}>
                All-in-one workspace: analyze or describe an image, pick a style, get artists, and generate prompts.
              </Text>
            </Box>

            {!ready && (
              <Alert
                color="yellow"
                variant="light"
                icon={<IconSettings size={18} />}
                title="AI Configuration required"
              >
                <Stack gap="sm">
                  <Text size="sm">
                    Configure at least one provider (OpenAI, OpenRouter, Ollama, vLLM, llama.cpp, or Custom) to continue.
                  </Text>
                  <Button variant="filled" w="fit-content" onClick={settingsModal.open}>
                    Open AI Configuration
                  </Button>
                </Stack>
              </Alert>
            )}

            {/* 1. Image analysis */}
            <SectionCard icon={<IconPhoto size={20} />} title="Image analysis">
              <Group align="flex-start" grow gap="lg">
                <Stack gap="sm">
                  <Dropzone
                    onDrop={handleDrop}
                    accept={IMAGE_MIME_TYPE}
                    multiple={false}
                    loading={imageProcessing}
                    disabled={imageProcessing}
                  >
                    <Group justify="center" gap="md" mih={120} style={{ pointerEvents: 'none' }}>
                      <Dropzone.Accept>
                        <IconUpload size={36} />
                      </Dropzone.Accept>
                      <Dropzone.Reject>
                        <IconX size={36} />
                      </Dropzone.Reject>
                      <Dropzone.Idle>
                        <IconPhoto size={36} />
                      </Dropzone.Idle>
                      <div>
                        <Text size="sm" inline>
                          Drag an image here or click to select
                        </Text>
                        <Text size="xs" c="dimmed" inline mt={6}>
                          Resized client-side to ~1MP JPEG before upload
                        </Text>
                      </div>
                    </Group>
                  </Dropzone>

                  {imageProcessing && (
                    <Group gap="xs">
                      <Loader size="sm" />
                      <Text size="sm" c="dimmed">
                        Processing image to ~1MP JPEG…
                      </Text>
                    </Group>
                  )}

                  {processedImageUrl && !imageProcessing && (
                    <Paper withBorder p="xs" radius="md">
                      <Stack gap={6}>
                        <Group gap={6}>
                          <IconCheck size={14} color="var(--mantine-color-teal-5)" />
                          <Text size="xs" c="dimmed">
                            Processed image ready ({file ? Math.round(file.size / 1024) : '?'}KB)
                          </Text>
                        </Group>
                        <Image
                          src={processedImageUrl}
                          alt="Processed upload"
                          radius="sm"
                          fit="contain"
                          mah={220}
                        />
                      </Stack>
                    </Paper>
                  )}

                  <Button
                    leftSection={<IconSparkles size={16} />}
                    onClick={analyze}
                    loading={busy.analyze}
                    disabled={!ready || !file || imageProcessing}
                  >
                    Analyze Image
                  </Button>
                </Stack>

                <Stack gap="sm">
                  <Textarea
                    label="Manual description"
                    placeholder="Describe the image yourself instead of analyzing…"
                    value={manual}
                    onChange={(e) => setManual(e.currentTarget.value)}
                    autosize
                    minRows={6}
                    maxRows={12}
                  />
                  <Button
                    variant="light"
                    w="fit-content"
                    onClick={useManual}
                    disabled={!ready || !manual.trim()}
                  >
                    Use Manual Description
                  </Button>
                </Stack>
              </Group>
              <ResultPanel text={analysis} meta={meta.analysis} />
            </SectionCard>

            {/* 2. Art style */}
            <SectionCard icon={<IconBrush size={20} />} title="Art style">
              <Stack gap="sm">
                <Autocomplete
                  label="Style"
                  placeholder="Impressionism, Cyberpunk, Art Nouveau…"
                  data={artStyles}
                  value={style}
                  onChange={setStyle}
                  comboboxProps={{ withinPortal: true }}
                />
                <Button
                  w="fit-content"
                  leftSection={<IconSparkles size={16} />}
                  onClick={genStyle}
                  loading={busy.style}
                  disabled={!ready || !style.trim()}
                >
                  Generate Style Description
                </Button>
              </Stack>
              <ResultPanel text={styleDesc} meta={meta.style} />
            </SectionCard>

            {/* 3. Artist recommendation */}
            <SectionCard icon={<IconUser size={20} />} title="Artist recommendation">
              <Button
                w="fit-content"
                leftSection={<IconUser size={16} />}
                onClick={genArtist}
                loading={busy.artist}
                disabled={!ready}
              >
                Recommend Artist
              </Button>
              <ResultPanel text={artist} meta={meta.artist} />
            </SectionCard>

            {/* 4. Flux / T5 prompt */}
            <SectionCard icon={<IconBolt size={20} />} title="Flux / T5 prompt">
              <Stack gap="sm">
                <Textarea
                  label="Additional requirements (optional)"
                  placeholder="Aspect ratio, mood, must-include details…"
                  value={custom}
                  onChange={(e) => setCustom(e.currentTarget.value)}
                  autosize
                  minRows={4}
                  maxRows={10}
                />
                <Button
                  w="fit-content"
                  leftSection={<IconBolt size={16} />}
                  onClick={genFlux}
                  loading={busy.flux}
                  disabled={!ready}
                >
                  Generate Flux Prompt
                </Button>
              </Stack>
              <ResultPanel text={flux} meta={meta.flux} label="T5 / Flux" copy />
            </SectionCard>

            {/* 5. SDXL prompt */}
            <SectionCard icon={<IconSparkles size={20} />} title="SDXL prompt">
              <Button
                w="fit-content"
                leftSection={<IconRefresh size={16} />}
                onClick={genSdxl}
                loading={busy.sdxl}
                disabled={!ready || !flux}
              >
                Generate SDXL from Flux
              </Button>
              <ResultPanel text={sdxl} meta={meta.sdxl} label="SDXL" copy />
            </SectionCard>
          </Stack>
        </Container>
      </AppShell.Main>

      <SettingsModal
        opened={settingsOpened}
        onClose={settingsModal.close}
        settings={settings}
        persist={persist}
        presets={presets}
        genDefaults={genDefaults}
        modelOptions={modelOptions}
        setModelOptions={setModelOptions}
      />
    </AppShell>
  )
}

// ---- Section card ------------------------------------------------------------

function SectionCard({ icon, title, children }) {
  return (
    <Card withBorder radius="md" padding="lg" shadow="sm">
      <Group gap="xs" mb="md">
        <ThemeIcon variant="light" color="violet" radius="md" size="lg">
          {icon}
        </ThemeIcon>
        <Title order={3} fw={600}>
          {title}
        </Title>
      </Group>
      {children}
    </Card>
  )
}

// ---- Result panel ------------------------------------------------------------

function ResultPanel({ text, meta, label, copy }) {
  if (!text) return null
  return (
    <Paper withBorder radius="md" p="md" mt="md" bg="var(--mantine-color-dark-6)">
      {(label || copy) && (
        <Group justify="space-between" mb="xs">
          {label ? (
            <Text fw={600} size="sm">
              {label}
            </Text>
          ) : (
            <span />
          )}
          {copy && (
            <CopyButton value={text} timeout={1500}>
              {({ copied, copy: doCopy }) => (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color={copied ? 'teal' : 'gray'}
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  onClick={doCopy}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              )}
            </CopyButton>
          )}
        </Group>
      )}
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {text}
      </Text>
      <MetaBar meta={meta} />
    </Paper>
  )
}

function MetaBar({ meta }) {
  if (!meta) return null
  const { provider, model, endpoint, ms, tokens } = meta
  let host = ''
  if (endpoint) {
    try {
      host = new URL(endpoint).hostname
    } catch {
      host = ''
    }
  }
  const parts = []
  if (provider) parts.push(provider)
  if (model) parts.push(model)
  if (ms != null) parts.push(`${ms}ms`)
  if (tokens != null) parts.push(`${tokens} tok`)
  if (host) parts.push(host)
  if (!parts.length) return null
  return (
    <Text size="xs" c="dimmed" mt={6}>
      {parts.join(' · ')}
    </Text>
  )
}

// ---- Settings modal ----------------------------------------------------------

function SettingsModal({ opened, onClose, settings, persist, presets, genDefaults, modelOptions, setModelOptions }) {
  const [local, setLocal] = useState(settings)
  const [testing, setTesting] = useState({})
  const [loadingModels, setLoadingModels] = useState({})

  // Re-sync local draft whenever the modal opens or external settings change.
  useEffect(() => {
    if (opened) setLocal(settings)
  }, [opened, settings])

  const setProvider = (id, key, value) => {
    setLocal((p) => ({
      ...p,
      providers: { ...p.providers, [id]: { ...p.providers[id], [key]: value } },
    }))
  }

  const setGen = (key, value) => {
    setLocal((p) => ({ ...p, generation: { ...p.generation, [key]: value } }))
  }

  const effectiveBaseUrl = (id) => {
    const preset = presets.find((x) => x.id === id)
    return local.providers[id]?.baseUrl || preset?.baseUrl || ''
  }

  const testProvider = async (id) => {
    setTesting((t) => ({ ...t, [id]: true }))
    try {
      const res = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: effectiveBaseUrl(id), apiKey: local.providers[id]?.apiKey || '' }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        notifications.show({
          color: 'teal',
          icon: <IconCheck size={16} />,
          title: 'Connection OK',
          message: `${labelFor(presets, id)}: ${data.count ?? 0} model(s) reachable`,
        })
      } else {
        notifications.show({
          color: 'red',
          icon: <IconX size={16} />,
          title: 'Connection failed',
          message: `${labelFor(presets, id)}: ${data.error || 'Unreachable'}`,
        })
      }
    } catch (e) {
      notifications.show({
        color: 'red',
        icon: <IconX size={16} />,
        title: 'Connection failed',
        message: `${labelFor(presets, id)}: ${e.message}`,
      })
    } finally {
      setTesting((t) => ({ ...t, [id]: false }))
    }
  }

  const loadModels = async (id) => {
    setLoadingModels((s) => ({ ...s, [id]: true }))
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: effectiveBaseUrl(id), apiKey: local.providers[id]?.apiKey || '' }),
      })
      const data = await res.json()
      if (res.ok && Array.isArray(data.models)) {
        setModelOptions((m) => ({ ...m, [id]: data.models }))
        notifications.show({
          color: 'teal',
          icon: <IconCheck size={16} />,
          title: 'Models loaded',
          message: `${labelFor(presets, id)}: ${data.models.length} model(s)`,
        })
      } else {
        throw new Error(data.error || 'No models returned')
      }
    } catch (e) {
      notifications.show({
        color: 'red',
        icon: <IconX size={16} />,
        title: 'Failed to load models',
        message: `${labelFor(presets, id)}: ${e.message}`,
      })
    } finally {
      setLoadingModels((s) => ({ ...s, [id]: false }))
    }
  }

  const save = () => {
    persist({ ...local })
    onClose()
  }

  // Build a per-provider Select data list: loaded options plus any current /
  // preset default value so a typed/persisted model stays selectable.
  const modelData = (id) => {
    const loaded = modelOptions[id] || []
    const map = new Map(loaded.map((o) => [o.value, o.label]))
    const current = local.providers[id]?.model
    if (current && !map.has(current)) map.set(current, current)
    const preset = presets.find((x) => x.id === id)
    if (preset?.defaultModel && !map.has(preset.defaultModel)) {
      map.set(preset.defaultModel, preset.defaultModel)
    }
    return Array.from(map, ([value, label]) => ({ value, label }))
  }

  return (
    <Modal opened={opened} onClose={onClose} title="AI Configuration" size="xl" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Configure any provider below. A provider is usable once its Base URL and Model are set (API key only when the
          provider requires one). The header dropdown selects which provider is active.
        </Text>

        <Select
          label="Active provider"
          data={presets.map((p) => ({ value: p.id, label: p.label }))}
          value={local.activeProvider}
          onChange={(v) => v && setLocal((p) => ({ ...p, activeProvider: v }))}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />

        <Divider label="Providers" labelPosition="center" />

        <Stack gap="lg">
          {presets.map((preset) => {
            const id = preset.id
            const prov = local.providers[id] || emptyProvider()
            return (
              <Paper key={id} withBorder radius="md" p="md">
                <Group justify="space-between" mb="sm">
                  <Text fw={600}>{preset.label}</Text>
                  {preset.needsKey ? (
                    <Text size="xs" c="dimmed">
                      API key required
                    </Text>
                  ) : (
                    <Text size="xs" c="dimmed">
                      Local / key optional
                    </Text>
                  )}
                </Group>
                <Stack gap="sm">
                  <Group grow align="flex-start">
                    <TextInput
                      label="Base URL"
                      placeholder={preset.baseUrl || 'https://…'}
                      value={prov.baseUrl}
                      onChange={(e) => setProvider(id, 'baseUrl', e.currentTarget.value)}
                    />
                    <PasswordInput
                      label="API Key"
                      placeholder={preset.needsKey ? 'sk-…' : 'optional'}
                      value={prov.apiKey}
                      onChange={(e) => setProvider(id, 'apiKey', e.currentTarget.value)}
                    />
                  </Group>
                  <Group grow align="flex-end">
                    <Select
                      label="Model"
                      placeholder="Pick or type a model"
                      data={modelData(id)}
                      value={prov.model || null}
                      onChange={(v) => setProvider(id, 'model', v || '')}
                      searchable
                      clearable
                      nothingFoundMessage="Load or type a model"
                      comboboxProps={{ withinPortal: true }}
                    />
                    <Group gap="xs" wrap="nowrap">
                      <Button
                        variant="default"
                        onClick={() => testProvider(id)}
                        loading={testing[id]}
                      >
                        Test
                      </Button>
                      <Button
                        variant="light"
                        leftSection={<IconDownload size={16} />}
                        onClick={() => loadModels(id)}
                        loading={loadingModels[id]}
                      >
                        Load models
                      </Button>
                    </Group>
                  </Group>
                </Stack>
              </Paper>
            )
          })}
        </Stack>

        <Divider label="Generation" labelPosition="center" />

        <Group grow>
          <NumberInput
            label="Temperature"
            value={local.generation?.temperature ?? genDefaults.temperature}
            onChange={(v) => setGen('temperature', v === '' ? '' : Number(v))}
            min={0}
            max={2}
            step={0.1}
            decimalScale={2}
          />
          <NumberInput
            label="Top P"
            value={local.generation?.top_p ?? genDefaults.top_p}
            onChange={(v) => setGen('top_p', v === '' ? '' : Number(v))}
            min={0}
            max={1}
            step={0.05}
            decimalScale={2}
          />
          <NumberInput
            label="Max tokens"
            value={local.generation?.max_tokens ?? genDefaults.max_tokens}
            onChange={(v) => setGen('max_tokens', v === '' ? '' : Number(v))}
            min={1}
            step={256}
            allowDecimal={false}
          />
        </Group>

        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function labelFor(presets, id) {
  return presets.find((p) => p.id === id)?.label || id
}
