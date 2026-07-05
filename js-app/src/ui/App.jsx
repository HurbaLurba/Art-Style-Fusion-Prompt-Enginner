import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Accordion,
  ActionIcon,
  Alert,
  AppShell,
  Autocomplete,
  Badge,
  Box,
  Button,
  Card,
  Container,
  CopyButton,
  Divider,
  Group,
  Image,
  Indicator,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  Popover,
  ScrollArea,
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
  IconArrowBackUp,
  IconBolt,
  IconBrush,
  IconCheck,
  IconCopy,
  IconDeviceFloppy,
  IconDownload,
  IconHistory,
  IconPhoto,
  IconRefresh,
  IconSettings,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconUser,
  IconX,
} from '@tabler/icons-react'
import {
  pushOutput,
  listOutput,
  removeOutput,
  clearOutput,
  listPresets,
  listVersions,
  savePreset,
  deletePreset,
  pushPromptVersion,
  deleteVersion,
} from './historyStore'

const SETTINGS_KEY = 'artStyleFusionSettings'
const SESSION_KEY = 'artStyleFusionSession'
const MAX_SESSION_IMAGE = 4 * 1024 * 1024 // localStorage-safe ceiling for the persisted image

// The six providers the UI always renders. Presets from /api/config are merged
// on top of these so server-supplied labels/baseUrls/defaultModels win.
const PROVIDER_FALLBACK = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', needsKey: true, defaultModel: '' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, defaultModel: '' },
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', needsKey: false, defaultModel: '' },
  { id: 'vllm', label: 'vLLM', baseUrl: 'http://localhost:8001/v1', needsKey: false, defaultModel: '' },
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
    prompts: {},
  }
}

// Per-step base prompts the user can override in the settings modal.
const PROMPT_FIELDS = [
  { key: 'image', label: 'Image analysis', minRows: 6 },
  { key: 'style', label: 'Art style description', minRows: 3 },
  { key: 'artist', label: 'Artist recommendation', minRows: 3 },
  { key: 'flux', label: 'Flux / T5 prompt', minRows: 4 },
  { key: 'sdxl', label: 'SDXL prompt', minRows: 3 },
]

// ---- small utilities ---------------------------------------------------------

function countWords(t) {
  return (t || '').trim().split(/\s+/).filter(Boolean).length
}

// Compact relative time for history rows; falls back to a locale date past a week.
function formatTs(ts) {
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)}d ago`
  return new Date(ts).toLocaleDateString()
}

// Section state var -> meta bucket key (meta is keyed by the API step name).
const SECTION_META = { analysis: 'analysis', styleDesc: 'style', artist: 'artist', flux: 'flux', sdxl: 'sdxl' }

// Parse JSON defensively: never let res.json() throw on a non-JSON error body
// (proxy HTML, plain-text rate-limit page) before we've checked res.ok.
async function readJson(res) {
  return res.json().catch(() => ({}))
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

async function postForm(url, form) {
  const res = await fetch(url, { method: 'POST', body: form })
  const data = await readJson(res)
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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
    next.providers.openai = { baseUrl: '', apiKey: raw.openai_api_key || '', model: raw.openai_model || '' }
    next.providers.openrouter = { baseUrl: '', apiKey: raw.openrouter_api_key || '', model: raw.openrouter_model || '' }
    next.providers.ollama = { baseUrl: raw.ollama_base_url || '', apiKey: '', model: raw.ollama_model || '' }
    if (raw.provider && next.providers[raw.provider]) next.activeProvider = raw.provider
    Storage.write(next)
    return next
  }

  if (raw && raw.providers) {
    const merged = blankSettings()
    merged.activeProvider = raw.activeProvider || merged.activeProvider
    merged.generation = { ...DEFAULT_GENERATION, ...(raw.generation || {}) }
    for (const id of Object.keys(merged.providers)) {
      merged.providers[id] = { ...emptyProvider(), ...(raw.providers[id] || {}) }
    }
    merged.prompts = { ...(raw.prompts || {}) }
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

function activeProviderReady(settings, presets) {
  return providerReady(settings, presets, settings.activeProvider)
}

// ---- App ---------------------------------------------------------------------

export default function App() {
  const [settings, setSettings] = useState(loadAndMigrateSettings)
  const [presets, setPresets] = useState(PROVIDER_FALLBACK)
  const [artStyles, setArtStyles] = useState([])
  const [genDefaults, setGenDefaults] = useState(DEFAULT_GENERATION)
  const [defaultPrompts, setDefaultPrompts] = useState({})
  const [settingsOpened, settingsModal] = useDisclosure(false)
  const [modelOptions, setModelOptions] = useState({})

  // Workflow state
  const [file, setFile] = useState(null)
  const [processedImageUrl, setProcessedImageUrl] = useState(null)
  const [imageProcessing, setImageProcessing] = useState(false)
  const [manual, setManual] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [analysisSource, setAnalysisSource] = useState(null) // 'analyzed' | 'manual' | null
  const [style, setStyle] = useState('')
  const [styleDesc, setStyleDesc] = useState('')
  const [artist, setArtist] = useState('')
  const [custom, setCustom] = useState('')
  const [flux, setFlux] = useState('')
  const [sdxl, setSdxl] = useState('')
  const [meta, setMeta] = useState({ analysis: null, style: null, artist: null, flux: null, sdxl: null })
  const [errors, setErrors] = useState({ analyze: null, style: null, artist: null, flux: null, sdxl: null })
  const [busy, setBusy] = useState({ analyze: false, style: false, artist: false, flux: false, sdxl: false })
  // Only the per-section integer counts live in render state; full entry lists
  // are read lazily from the store on menu open (never held here).
  const [histCounts, setHistCounts] = useState({ analysis: 0, styleDesc: 0, artist: 0, flux: 0, sdxl: 0 })

  const restoredRef = useRef(false)
  const saveTimer = useRef(null)
  const autoOpenedRef = useRef(false)
  // Signature of the inputs used when each downstream output was generated, so
  // we can flag an output as stale once an upstream input changes.
  const sigRef = useRef({ styleDesc: null, artist: null, flux: null, sdxl: null })

  const ready = useMemo(() => activeProviderReady(settings, presets), [settings, presets])

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

    fetch('/api/config')
      .then(readJson)
      .then((cfg) => {
        if (!mounted) return
        if (Array.isArray(cfg.providerPresets) && cfg.providerPresets.length) {
          const byId = Object.fromEntries(PROVIDER_FALLBACK.map((p) => [p.id, p]))
          for (const sp of cfg.providerPresets) byId[sp.id] = { ...(byId[sp.id] || {}), ...sp }
          setPresets(Object.values(byId))
        }
        if (Array.isArray(cfg.artStyles)) setArtStyles(cfg.artStyles)
        if (cfg.generation) {
          setGenDefaults({
            temperature: cfg.generation.temperature ?? DEFAULT_GENERATION.temperature,
            top_p: cfg.generation.top_p ?? DEFAULT_GENERATION.top_p,
            max_tokens: cfg.generation.max_tokens ?? DEFAULT_GENERATION.max_tokens,
          })
        }
        if (cfg.defaultPrompts) setDefaultPrompts(cfg.defaultPrompts)
      })
      .catch(() => {})

    fetch('/api/env-hints')
      .then(readJson)
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
          if (envP.baseUrl && !cur.baseUrl) { cur.baseUrl = envP.baseUrl; changed = true }
          if (envP.apiKey && !cur.apiKey) { cur.apiKey = envP.apiKey; changed = true }
          if (envP.model && !cur.model) { cur.model = envP.model; changed = true }
          next.providers[id] = cur
        }
        if (hints.activeProvider && next.providers[hints.activeProvider] && !current.activeProvider) {
          next.activeProvider = hints.activeProvider
          changed = true
        }
        if (changed) persist(next)
      })
      .catch(() => {})

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
      // Seed signatures so restored outputs are NOT flagged stale on load.
      sigRef.current = {
        styleDesc: sess.styleDesc ? (sess.style || '') : null,
        artist: sess.artist ? JSON.stringify([sess.style || '', sess.styleDesc || '', sess.analysis || '', sess.custom || '']) : null,
        flux: sess.flux ? JSON.stringify([sess.style || '', sess.styleDesc || '', sess.analysis || '', sess.artist || '', sess.custom || '']) : null,
        sdxl: sess.sdxl ? (sess.flux || '') : null,
      }
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
    }
    restoredRef.current = true

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-open settings ONCE on mount if the active provider isn't ready. Guarded
  // by a ref so live settings changes (header select, env-hints) never re-trap.
  useEffect(() => {
    if (autoOpenedRef.current) return
    autoOpenedRef.current = true
    if (!ready) settingsModal.open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // Seed the history badge counts once from the persisted store.
  useEffect(() => {
    setHistCounts({
      analysis: listOutput('analysis').length,
      styleDesc: listOutput('styleDesc').length,
      artist: listOutput('artist').length,
      flux: listOutput('flux').length,
      sdxl: listOutput('sdxl').length,
    })
  }, [])

  // ---- debounced session save -----------------------------------------------
  useEffect(() => {
    if (!restoredRef.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const data = { manual, analysis, style, styleDesc, artist, custom, flux, sdxl }
      // Only persist the image if it fits the localStorage ceiling, so a huge
      // image can never throw quota and drop the text session in the same write.
      if (processedImageUrl && processedImageUrl.startsWith('data:') && processedImageUrl.length < MAX_SESSION_IMAGE) {
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

  // ---- image processing (client-side resize to ~1MP) ------------------------
  const processImage = (imageFile) => {
    return new Promise((resolve) => {
      setImageProcessing(true)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new window.Image()
      img.onload = () => {
        try {
          const targetPixels = 1000000
          const ratio = Math.sqrt(targetPixels / (img.width * img.height))
          const newWidth = Math.max(1, Math.round(img.width * ratio))
          const newHeight = Math.max(1, Math.round(img.height * ratio))
          canvas.width = newWidth
          canvas.height = newHeight
          ctx.drawImage(img, 0, 0, newWidth, newHeight)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
          canvas.toBlob(
            (blob) => {
              const processedName = imageFile?.name ? `processed-${imageFile.name}` : 'processed-image.jpg'
              const processedFile = blob ? new File([blob], processedName, { type: 'image/jpeg' }) : imageFile
              setProcessedImageUrl(dataUrl)
              setImageProcessing(false)
              if (dataUrl.length < MAX_SESSION_IMAGE) {
                const session = Session.load()
                session.imageDataUrl = dataUrl
                session.imageName = processedName
                session.imageType = 'image/jpeg'
                Session.save(session)
              } else {
                notifications.show({
                  color: 'yellow',
                  title: 'Image too large to persist',
                  message: 'It will be used now, but won’t survive a page reload.',
                })
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
      reader.onload = () => { img.src = reader.result }
      reader.onerror = () => { setImageProcessing(false); resolve(imageFile) }
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

  const removeImage = () => {
    setFile(null)
    setProcessedImageUrl(null)
    const s = Session.load()
    delete s.imageDataUrl
    delete s.imageName
    delete s.imageType
    Session.save(s)
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

  // Record a successful output into per-section history. Best-effort: a quota
  // failure inside the store must never break the generation that produced it.
  const appendOutput = (section, text, metaObj, source) => {
    try {
      const n = pushOutput(section, text, metaObj, source)
      setHistCounts((c) => ({ ...c, [section]: n }))
    } catch {
      /* history is a best-effort safety net */
    }
  }

  const analyze = withBusy('analyze', async () => {
    setErrors((e) => ({ ...e, analyze: null }))
    try {
      const form = new FormData()
      form.append('settings', JSON.stringify(settings))
      form.append('image', file)
      const data = await postForm('/api/analyze-image', form)
      setAnalysis(data.analysis || '')
      setMeta((m) => ({ ...m, analysis: data.meta || null }))
      setAnalysisSource('analyzed')
      appendOutput('analysis', data.analysis || '', data.meta, 'analyzed')
    } catch (e) {
      setErrors((x) => ({ ...x, analyze: e.message }))
    }
  })

  const useManual = () => {
    setAnalysis(manual)
    setAnalysisSource('manual')
    setMeta((m) => ({ ...m, analysis: null }))
    setErrors((e) => ({ ...e, analyze: null }))
    appendOutput('analysis', manual, null, 'manual')
  }

  const genStyle = withBusy('style', async () => {
    setErrors((e) => ({ ...e, style: null }))
    try {
      const data = await postJson('/api/generate-style-description', { style, settings })
      setStyleDesc(data.description || '')
      setMeta((m) => ({ ...m, style: data.meta || null }))
      sigRef.current.styleDesc = style
      appendOutput('styleDesc', data.description || '', data.meta)
    } catch (e) {
      setErrors((x) => ({ ...x, style: e.message }))
    }
  })

  const genArtist = withBusy('artist', async () => {
    setErrors((e) => ({ ...e, artist: null }))
    const sig = JSON.stringify([style, styleDesc, analysis, custom])
    try {
      const data = await postJson('/api/recommend-artist', {
        style,
        styleDescription: styleDesc,
        imageDescription: analysis,
        themes: custom,
        settings,
      })
      setArtist(data.recommendation || '')
      setMeta((m) => ({ ...m, artist: data.meta || null }))
      sigRef.current.artist = sig
      appendOutput('artist', data.recommendation || '', data.meta)
    } catch (e) {
      setErrors((x) => ({ ...x, artist: e.message }))
    }
  })

  const genFlux = withBusy('flux', async () => {
    setErrors((e) => ({ ...e, flux: null }))
    const sig = JSON.stringify([style, styleDesc, analysis, artist, custom])
    try {
      const data = await postJson('/api/generate-flux-prompt', {
        style,
        styleDescription: styleDesc,
        imageDescription: analysis,
        artistRecommendation: artist,
        customInputs: custom,
        settings,
      })
      setFlux(data.prompt || '')
      setMeta((m) => ({ ...m, flux: data.meta || null }))
      sigRef.current.flux = sig
      appendOutput('flux', data.prompt || '', data.meta)
    } catch (e) {
      setErrors((x) => ({ ...x, flux: e.message }))
    }
  })

  const genSdxl = withBusy('sdxl', async () => {
    setErrors((e) => ({ ...e, sdxl: null }))
    const sig = flux
    try {
      const data = await postJson('/api/generate-sdxl-prompt', { fluxPrompt: flux, settings })
      setSdxl(data.prompt || '')
      setMeta((m) => ({ ...m, sdxl: data.meta || null }))
      sigRef.current.sdxl = sig
      appendOutput('sdxl', data.prompt || '', data.meta)
    } catch (e) {
      setErrors((x) => ({ ...x, sdxl: e.message }))
    }
  })

  // ---- per-section clear + clear all ----------------------------------------
  const clearAnalysis = () => {
    setAnalysis('')
    setAnalysisSource(null)
    setMeta((m) => ({ ...m, analysis: null }))
    setErrors((e) => ({ ...e, analyze: null }))
  }
  const clearStyleDesc = () => {
    setStyleDesc('')
    setMeta((m) => ({ ...m, style: null }))
    sigRef.current.styleDesc = null
  }
  const clearArtist = () => {
    setArtist('')
    setMeta((m) => ({ ...m, artist: null }))
    sigRef.current.artist = null
  }
  const clearFlux = () => {
    setFlux('')
    setMeta((m) => ({ ...m, flux: null }))
    sigRef.current.flux = null
  }
  const clearSdxl = () => {
    setSdxl('')
    setMeta((m) => ({ ...m, sdxl: null }))
    sigRef.current.sdxl = null
  }

  const clearAll = () => {
    if (!window.confirm('Clear all generated content and the image? Your provider settings are kept.')) return
    setFile(null)
    setProcessedImageUrl(null)
    setManual('')
    setAnalysis('')
    setAnalysisSource(null)
    setStyle('')
    setStyleDesc('')
    setArtist('')
    setCustom('')
    setFlux('')
    setSdxl('')
    setMeta({ analysis: null, style: null, artist: null, flux: null, sdxl: null })
    setErrors({ analyze: null, style: null, artist: null, flux: null, sdxl: null })
    sigRef.current = { styleDesc: null, artist: null, flux: null, sdxl: null }
    Session.clear()
  }

  // ---- output history: restore / delete / clear -----------------------------
  const restoreOutput = (section, entry) => {
    const setters = { analysis: setAnalysis, styleDesc: setStyleDesc, artist: setArtist, flux: setFlux, sdxl: setSdxl }
    const setter = setters[section]
    if (!setter) return
    // Capture the current live value into history before overwriting it, so an
    // unsaved hand-edit isn't silently lost. pushOutput dedupes if it's already
    // the newest stored entry, so a plain restore-to-compare adds nothing.
    const currentVals = { analysis, styleDesc, artist, flux, sdxl }
    const current = currentVals[section]
    if (current && current.trim() && current.trim() !== (entry.text || '').trim()) {
      appendOutput(section, current, meta[SECTION_META[section]] || null, section === 'analysis' ? analysisSource : undefined)
    }
    setter(entry.text)
    const metaObj =
      entry.provider || entry.model || entry.tokens != null
        ? { provider: entry.provider, model: entry.model, tokens: entry.tokens }
        : null
    if (section === 'analysis') {
      setAnalysisSource(entry.source || null)
      setMeta((m) => ({ ...m, analysis: metaObj }))
    } else {
      // Originating inputs are unknown for a restored downstream output, so
      // suppress a misleading stale badge rather than flag it against live inputs.
      sigRef.current[section] = null
      setMeta((m) => ({ ...m, [SECTION_META[section]]: metaObj }))
    }
  }

  const deleteOutputEntry = (section, id) => {
    setHistCounts((c) => ({ ...c, [section]: removeOutput(section, id) }))
  }

  const clearOutputHistory = (section) => {
    clearOutput(section)
    setHistCounts((c) => ({ ...c, [section]: 0 }))
  }

  // ---- stale detection (current inputs vs inputs at generation time) --------
  const stale = {
    styleDesc: Boolean(styleDesc) && sigRef.current.styleDesc !== null && sigRef.current.styleDesc !== style,
    artist:
      Boolean(artist) &&
      sigRef.current.artist !== null &&
      sigRef.current.artist !== JSON.stringify([style, styleDesc, analysis, custom]),
    flux:
      Boolean(flux) &&
      sigRef.current.flux !== null &&
      sigRef.current.flux !== JSON.stringify([style, styleDesc, analysis, artist, custom]),
    sdxl: Boolean(sdxl) && sigRef.current.sdxl !== null && sigRef.current.sdxl !== flux,
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
                <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={clearAll}>
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
                All-in-one workspace: analyze or describe an image, pick a style, optionally get an artist, and generate prompts.
              </Text>
            </Box>

            {!ready && (
              <Alert color="yellow" variant="light" icon={<IconSettings size={18} />} title="AI Configuration required">
                <Stack gap="sm">
                  <Text size="sm">
                    The active provider isn’t configured. Set a Base URL and Model (and API key if required) to continue.
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
                      <Dropzone.Accept><IconUpload size={36} /></Dropzone.Accept>
                      <Dropzone.Reject><IconX size={36} /></Dropzone.Reject>
                      <Dropzone.Idle><IconPhoto size={36} /></Dropzone.Idle>
                      <div>
                        <Text size="sm" inline>Drag an image here or click to select</Text>
                        <Text size="xs" c="dimmed" inline mt={6}>Resized client-side to ~1MP JPEG before upload</Text>
                      </div>
                    </Group>
                  </Dropzone>

                  {processedImageUrl && !imageProcessing && (
                    <Paper withBorder p="xs" radius="md">
                      <Stack gap={6}>
                        <Group justify="space-between" gap={6} wrap="nowrap">
                          <Group gap={6} wrap="nowrap">
                            <IconCheck size={14} color="var(--mantine-color-teal-5)" />
                            <Text size="xs" c="dimmed">
                              Ready ({file ? Math.round(file.size / 1024) : '?'}KB)
                            </Text>
                          </Group>
                          <Tooltip label="Remove image">
                            <ActionIcon size="sm" variant="subtle" color="red" onClick={removeImage} aria-label="Remove image">
                              <IconX size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                        <Image src={processedImageUrl} alt="Processed upload" radius="sm" fit="contain" mah={220} />
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
                  <Button variant="light" w="fit-content" onClick={useManual} disabled={!ready || !manual.trim() || busy.analyze}>
                    Use Manual Description
                  </Button>
                </Stack>
              </Group>
              <OutputPanel
                value={analysis}
                onChange={setAnalysis}
                onClear={clearAnalysis}
                meta={meta.analysis}
                error={errors.analyze}
                onDismissError={() => setErrors((e) => ({ ...e, analyze: null }))}
                label={analysisSource === 'manual' ? 'Manual description' : 'Analysis'}
                badge={analysisSource === 'manual' ? { label: 'manual', color: 'blue' } : null}
                showWords
                section="analysis"
                historyCount={histCounts.analysis}
                onRestore={restoreOutput}
                onDeleteEntry={deleteOutputEntry}
                onClearHistory={clearOutputHistory}
              />
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
              <OutputPanel
                value={styleDesc}
                onChange={setStyleDesc}
                onClear={clearStyleDesc}
                meta={meta.style}
                error={errors.style}
                onDismissError={() => setErrors((e) => ({ ...e, style: null }))}
                label="Style description"
                stale={stale.styleDesc}
                showWords
                section="styleDesc"
                historyCount={histCounts.styleDesc}
                onRestore={restoreOutput}
                onDeleteEntry={deleteOutputEntry}
                onClearHistory={clearOutputHistory}
              />
            </SectionCard>

            {/* 3. Artist recommendation (optional) */}
            <SectionCard icon={<IconUser size={20} />} title="Artist recommendation" subtitle="Optional — prompts generate fine without it">
              <Button
                w="fit-content"
                leftSection={<IconUser size={16} />}
                onClick={genArtist}
                loading={busy.artist}
                disabled={!ready || !style.trim()}
              >
                Recommend Artist
              </Button>
              <OutputPanel
                value={artist}
                onChange={setArtist}
                onClear={clearArtist}
                meta={meta.artist}
                error={errors.artist}
                onDismissError={() => setErrors((e) => ({ ...e, artist: null }))}
                label="Artist"
                stale={stale.artist}
                showWords
                section="artist"
                historyCount={histCounts.artist}
                onRestore={restoreOutput}
                onDeleteEntry={deleteOutputEntry}
                onClearHistory={clearOutputHistory}
              />
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
                  disabled={!ready || !style.trim() || !analysis.trim()}
                >
                  Generate Flux Prompt
                </Button>
                {!analysis.trim() && (
                  <Text size="xs" c="dimmed">
                    Add an image analysis or manual description first. Artist recommendation is optional.
                  </Text>
                )}
              </Stack>
              <OutputPanel
                value={flux}
                onChange={setFlux}
                onClear={clearFlux}
                meta={meta.flux}
                error={errors.flux}
                onDismissError={() => setErrors((e) => ({ ...e, flux: null }))}
                label="T5 / Flux"
                stale={stale.flux}
                showWords
                wordCap={512}
                section="flux"
                historyCount={histCounts.flux}
                onRestore={restoreOutput}
                onDeleteEntry={deleteOutputEntry}
                onClearHistory={clearOutputHistory}
              />
            </SectionCard>

            {/* 5. SDXL prompt */}
            <SectionCard icon={<IconSparkles size={20} />} title="SDXL prompt">
              <Button
                w="fit-content"
                leftSection={<IconRefresh size={16} />}
                onClick={genSdxl}
                loading={busy.sdxl}
                disabled={!ready || !flux.trim()}
              >
                Generate SDXL from Flux
              </Button>
              <OutputPanel
                value={sdxl}
                onChange={setSdxl}
                onClear={clearSdxl}
                meta={meta.sdxl}
                error={errors.sdxl}
                onDismissError={() => setErrors((e) => ({ ...e, sdxl: null }))}
                label="SDXL"
                stale={stale.sdxl}
                showWords
                wordCap={256}
                section="sdxl"
                historyCount={histCounts.sdxl}
                onRestore={restoreOutput}
                onDeleteEntry={deleteOutputEntry}
                onClearHistory={clearOutputHistory}
              />
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
        defaultPrompts={defaultPrompts}
        modelOptions={modelOptions}
        setModelOptions={setModelOptions}
      />
    </AppShell>
  )
}

// ---- Section card ------------------------------------------------------------

function SectionCard({ icon, title, subtitle, children }) {
  return (
    <Card withBorder radius="md" padding="lg" shadow="sm">
      <Group gap="xs" mb="md" align="center">
        <ThemeIcon variant="light" color="violet" radius="md" size="lg">
          {icon}
        </ThemeIcon>
        <div>
          <Title order={3} fw={600}>{title}</Title>
          {subtitle && <Text size="xs" c="dimmed">{subtitle}</Text>}
        </div>
      </Group>
      {children}
    </Card>
  )
}

// ---- Reusable history/preset primitives -------------------------------------

// A controlled Popover whose dropdown lists items read FRESH from `load()` every
// time it opens. Holds zero feature-specific logic — callers supply `renderRow`
// and an optional `footer`, and receive `{ close, refresh }` to drive them.
function HistoryMenu({ trigger, load, renderRow, emptyText, footer, width = 400 }) {
  const [opened, setOpened] = useState(false)
  const [items, setItems] = useState([])
  const refresh = () => setItems(load())
  // Toggle (not open-only): a controlled Popover attaches no toggle handler to
  // its target, so re-clicking the trigger must close it explicitly.
  const toggle = () => {
    if (opened) {
      setOpened(false)
      return
    }
    setItems(load())
    setOpened(true)
  }
  const close = () => setOpened(false)
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withinPortal shadow="md" width={width}>
      <Popover.Target>{trigger(toggle)}</Popover.Target>
      <Popover.Dropdown p="xs">
        <ScrollArea.Autosize mah="60vh">
          {items.length === 0 ? (
            <Text size="sm" c="dimmed" p="xs">{emptyText}</Text>
          ) : (
            <Stack gap={6}>{items.map((item) => renderRow(item, { close, refresh }))}</Stack>
          )}
        </ScrollArea.Autosize>
        {footer && (
          <>
            <Divider my="xs" />
            {footer({ close, refresh, items })}
          </>
        )}
      </Popover.Dropdown>
    </Popover>
  )
}

// Read-only full-text preview so large entries (e.g. a ~4000-token analysis)
// stay inspectable without restoring them into the editor.
function PreviewModal({ entry, onClose }) {
  return (
    <Modal opened={Boolean(entry)} onClose={onClose} title="Preview" size="lg" centered>
      {entry && (
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Text size="xs" c="dimmed">{formatTs(entry.ts)} · {entry.words} words</Text>
            <CopyButton value={entry.text || ''} timeout={1500}>
              {({ copied, copy }) => (
                <Button
                  size="xs"
                  variant="light"
                  color={copied ? 'teal' : 'gray'}
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  onClick={copy}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              )}
            </CopyButton>
          </Group>
          <Textarea value={entry.text || ''} readOnly autosize minRows={6} maxRows={24} variant="filled" aria-label="Preview" />
        </Stack>
      )}
    </Modal>
  )
}

// ---- Output panel (editable, copyable, downloadable, clearable) -------------

function OutputPanel({
  value,
  onChange,
  onClear,
  meta,
  error,
  onDismissError,
  label,
  badge,
  stale,
  showWords,
  wordCap,
  section,
  historyCount = 0,
  onRestore,
  onDeleteEntry,
  onClearHistory,
}) {
  const hasValue = typeof value === 'string' && value.length > 0
  const words = showWords && hasValue ? countWords(value) : null
  const [preview, setPreview] = useState(null)

  const historyControl = historyCount > 0 && (
    <HistoryMenu
      width={400}
      load={() => listOutput(section)}
      emptyText="No history yet."
      trigger={(open) => (
        <Indicator label={historyCount} size={16} disabled={!historyCount}>
          <Tooltip label="History">
            <ActionIcon variant="subtle" color="gray" onClick={open} aria-label="History">
              <IconHistory size={16} />
            </ActionIcon>
          </Tooltip>
        </Indicator>
      )}
      renderRow={(entry, { close, refresh }) => (
        <Paper key={entry.id} withBorder radius="sm" p="xs">
          <Group justify="space-between" wrap="nowrap" gap="xs" mb={4}>
            <Group gap={6} wrap="nowrap">
              <Text size="xs" c="dimmed">{formatTs(entry.ts)}</Text>
              {section === 'analysis' && entry.source && (
                <Badge size="xs" variant="light" color={entry.source === 'manual' ? 'blue' : 'grape'}>
                  {entry.source}
                </Badge>
              )}
              {entry.model && (
                <Badge size="xs" variant="outline" color="gray" tt="none" style={{ maxWidth: 150 }}>
                  {entry.model}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{entry.words} words</Text>
          </Group>
          <Text size="xs" lineClamp={2} style={{ cursor: 'pointer' }} onClick={() => setPreview(entry)}>
            {entry.text}
          </Text>
          <Group justify="flex-end" gap={2} mt={4} wrap="nowrap">
            <Tooltip label="Restore into editor">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label="Restore"
                onClick={() => { onRestore(section, entry); close() }}
              >
                <IconArrowBackUp size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete entry">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                aria-label="Delete"
                onClick={() => { onDeleteEntry(section, entry.id); refresh() }}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Paper>
      )}
      footer={({ close, items }) => (
        <Group justify="space-between" px="xs" wrap="nowrap">
          <Text size="xs" c="dimmed">{items.length} {items.length === 1 ? 'entry' : 'entries'}</Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            onClick={() => {
              if (window.confirm('Clear all history for this section? This cannot be undone.')) {
                onClearHistory(section)
                close()
              }
            }}
          >
            Clear history
          </Button>
        </Group>
      )}
    />
  )

  return (
    <>
      {error && (
        <Alert
          color="red"
          variant="light"
          mt="md"
          radius="md"
          icon={<IconX size={16} />}
          title="Request failed"
          withCloseButton
          onClose={onDismissError}
        >
          {error}
        </Alert>
      )}
      {(hasValue || historyCount > 0) && (
        <Paper withBorder radius="md" p="md" mt="md" bg="var(--mantine-color-dark-6)">
          {hasValue ? (
            <>
              <Group justify="space-between" mb="xs" wrap="nowrap" align="center">
                <Group gap="xs" wrap="nowrap">
                  {label && <Text fw={600} size="sm">{label}</Text>}
                  {badge && <Badge color={badge.color} variant="light" size="sm">{badge.label}</Badge>}
                  {stale && (
                    <Tooltip label="An input changed after this was generated — regenerate to refresh">
                      <Badge color="yellow" variant="light" size="sm" leftSection={<IconRefresh size={11} />}>stale</Badge>
                    </Tooltip>
                  )}
                  {words != null && (
                    <Text size="xs" c={wordCap && words > wordCap ? 'red' : 'dimmed'}>
                      {words}{wordCap ? ` / ${wordCap}` : ''} words
                    </Text>
                  )}
                </Group>
                <Group gap={2} wrap="nowrap">
                  <CopyButton value={value} timeout={1500}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? 'Copied' : 'Copy'}>
                        <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} aria-label="Copy">
                          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                  <Tooltip label="Download as .txt">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={() => downloadText(`${(label || 'output').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`, value)}
                      aria-label="Download"
                    >
                      <IconDownload size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Clear this section">
                    <ActionIcon variant="subtle" color="red" onClick={onClear} aria-label="Clear">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                  {historyControl}
                </Group>
              </Group>
              <Textarea
                value={value}
                onChange={(e) => onChange(e.currentTarget.value)}
                autosize
                minRows={3}
                maxRows={24}
                variant="filled"
                aria-label={`${label || 'Output'} (editable)`}
              />
              <MetaBar meta={meta} />
            </>
          ) : (
            <Group justify="space-between" wrap="nowrap" align="center">
              <Group gap="xs" wrap="nowrap">
                {label && <Text fw={600} size="sm">{label}</Text>}
                <Text size="xs" c="dimmed">cleared · {historyCount} in history</Text>
              </Group>
              {historyControl}
            </Group>
          )}
        </Paper>
      )}
      <PreviewModal entry={preview} onClose={() => setPreview(null)} />
    </>
  )
}

function MetaBar({ meta }) {
  if (!meta) return null
  const { provider, model, endpoint, ms, tokens, droppedSamplingParams } = meta
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
  if (droppedSamplingParams?.length) parts.push(`${droppedSamplingParams.join('+')} ignored`)
  if (!parts.length) return null
  return (
    <Text size="xs" c="dimmed" mt={6}>
      {parts.join(' · ')}
    </Text>
  )
}

// ---- Settings modal ----------------------------------------------------------

function SettingsModal({ opened, onClose, settings, persist, presets, genDefaults, defaultPrompts, modelOptions, setModelOptions }) {
  const [local, setLocal] = useState(settings)
  const [testing, setTesting] = useState({})
  const [loadingModels, setLoadingModels] = useState({})

  useEffect(() => {
    if (opened) setLocal(settings)
  }, [opened, settings])

  const setProvider = (id, key, value) => {
    setLocal((p) => ({ ...p, providers: { ...p.providers, [id]: { ...p.providers[id], [key]: value } } }))
  }

  const setGen = (key, value) => {
    setLocal((p) => ({ ...p, generation: { ...p.generation, [key]: value } }))
  }

  const setPrompt = (key, value) => {
    setLocal((p) => ({ ...p, prompts: { ...(p.prompts || {}), [key]: value } }))
  }

  const effectiveBaseUrl = (id) => {
    const preset = presets.find((x) => x.id === id)
    return (local.providers[id]?.baseUrl || preset?.baseUrl || '').trim()
  }

  const testProvider = async (id) => {
    setTesting((t) => ({ ...t, [id]: true }))
    try {
      const data = await postJson('/api/test', { baseUrl: effectiveBaseUrl(id), apiKey: local.providers[id]?.apiKey || '' })
      if (data.ok) {
        notifications.show({ color: 'teal', icon: <IconCheck size={16} />, title: 'Connection OK', message: `${labelFor(presets, id)}: ${data.count ?? 0} model(s) reachable` })
      } else {
        notifications.show({ color: 'red', icon: <IconX size={16} />, title: 'Connection failed', message: `${labelFor(presets, id)}: ${data.error || 'Unreachable'}` })
      }
    } catch (e) {
      notifications.show({ color: 'red', icon: <IconX size={16} />, title: 'Connection failed', message: `${labelFor(presets, id)}: ${e.message}` })
    } finally {
      setTesting((t) => ({ ...t, [id]: false }))
    }
  }

  const loadModels = async (id) => {
    setLoadingModels((s) => ({ ...s, [id]: true }))
    try {
      const data = await postJson('/api/models', { baseUrl: effectiveBaseUrl(id), apiKey: local.providers[id]?.apiKey || '', providerId: id })
      if (Array.isArray(data.models)) {
        setModelOptions((m) => ({ ...m, [id]: data.models }))
        notifications.show({ color: 'teal', icon: <IconCheck size={16} />, title: 'Models loaded', message: `${labelFor(presets, id)}: ${data.models.length} model(s)` })
      } else {
        throw new Error('No models returned')
      }
    } catch (e) {
      notifications.show({ color: 'red', icon: <IconX size={16} />, title: 'Failed to load models', message: `${labelFor(presets, id)}: ${e.message}` })
    } finally {
      setLoadingModels((s) => ({ ...s, [id]: false }))
    }
  }

  const save = () => {
    // Coerce empty standard params back to sane numbers; leave top_k/min_p unset
    // when blank so the server omits them (they're optional, provider-dependent).
    const g = local.generation || {}
    const generation = {
      temperature: g.temperature === '' || g.temperature == null ? genDefaults.temperature : Number(g.temperature),
      top_p: g.top_p === '' || g.top_p == null ? genDefaults.top_p : Number(g.top_p),
      max_tokens: g.max_tokens === '' || g.max_tokens == null ? genDefaults.max_tokens : Number(g.max_tokens),
    }
    if (g.top_k !== '' && g.top_k != null) generation.top_k = Number(g.top_k)
    if (g.min_p !== '' && g.min_p != null) generation.min_p = Number(g.min_p)
    // Snapshot the prior committed prompt into version history before overwriting
    // it. Compare against `settings` (committed), not the stale local editor state.
    for (const { key } of PROMPT_FIELDS) {
      const oldV = settings.prompts?.[key] || ''
      const newV = local.prompts?.[key] || ''
      if (oldV !== newV && oldV.trim()) pushPromptVersion(key, oldV)
    }
    persist({ ...local, generation })
    onClose()
  }

  const modelData = (id) => {
    const loaded = modelOptions[id] || []
    const map = new Map(loaded.map((o) => [o.value, o.label]))
    const current = local.providers[id]?.model
    if (current && !map.has(current)) map.set(current, current)
    const preset = presets.find((x) => x.id === id)
    if (preset?.defaultModel && !map.has(preset.defaultModel)) map.set(preset.defaultModel, preset.defaultModel)
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
            const noBase = !effectiveBaseUrl(id)
            return (
              <Paper key={id} withBorder radius="md" p="md">
                <Group justify="space-between" mb="sm">
                  <Text fw={600}>{preset.label}</Text>
                  <Text size="xs" c="dimmed">{preset.needsKey ? 'API key required' : 'Local / key optional'}</Text>
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
                      <Button variant="default" onClick={() => testProvider(id)} loading={testing[id]} disabled={noBase}>
                        Test
                      </Button>
                      <Button variant="light" leftSection={<IconDownload size={16} />} onClick={() => loadModels(id)} loading={loadingModels[id]} disabled={noBase}>
                        Load models
                      </Button>
                    </Group>
                  </Group>
                  {id === 'openrouter' && (
                    <Text size="xs" c="dimmed">
                      Model list is filtered to vision (image→text) models, since this model also runs the image-analysis step.
                    </Text>
                  )}
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
            onChange={(v) => setGen('temperature', v)}
            min={0}
            max={2}
            step={0.1}
            decimalScale={2}
          />
          <NumberInput
            label="Top P"
            value={local.generation?.top_p ?? genDefaults.top_p}
            onChange={(v) => setGen('top_p', v)}
            min={0}
            max={1}
            step={0.05}
            decimalScale={2}
          />
          <NumberInput
            label="Max tokens"
            value={local.generation?.max_tokens ?? genDefaults.max_tokens}
            onChange={(v) => setGen('max_tokens', v)}
            min={1}
            step={256}
            allowDecimal={false}
          />
        </Group>

        <Group grow align="flex-start">
          <NumberInput
            label="Top K"
            description="Blank = off. Dropped automatically if the provider rejects it (e.g. OpenAI)."
            placeholder="provider default"
            value={local.generation?.top_k ?? ''}
            onChange={(v) => setGen('top_k', v)}
            min={0}
            step={1}
            allowDecimal={false}
          />
          <NumberInput
            label="Min P"
            description="Blank = off. Dropped automatically if unsupported."
            placeholder="provider default"
            value={local.generation?.min_p ?? ''}
            onChange={(v) => setGen('min_p', v)}
            min={0}
            max={1}
            step={0.05}
            decimalScale={2}
          />
        </Group>

        <Divider label="Prompt engineering" labelPosition="center" />
        <Text size="xs" c="dimmed">
          Override the base instruction for any step. Blank = built-in default. Overrides are saved with your settings in this browser.
        </Text>
        <Accordion variant="contained" multiple>
          {PROMPT_FIELDS.map((f) => {
            const isCustom = Boolean((local.prompts?.[f.key] || '').trim())
            return (
              <Accordion.Item key={f.key} value={f.key}>
                <Accordion.Control>
                  <Group justify="space-between" pr="sm" wrap="nowrap">
                    <Text size="sm" fw={500}>{f.label}</Text>
                    <Badge size="xs" variant="light" color={isCustom ? 'violet' : 'gray'}>
                      {isCustom ? 'custom' : 'default'}
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    <Group gap="xs">
                      <HistoryMenu
                        width={300}
                        load={() => [{ id: '__default__', name: 'Default (built-in)', __default: true }, ...listPresets(f.key)]}
                        emptyText="No saved presets."
                        trigger={(open) => (
                          <Button size="xs" variant="light" leftSection={<IconHistory size={14} />} onClick={open}>
                            Presets
                          </Button>
                        )}
                        renderRow={(p, { close, refresh }) => {
                          if (p.__default) {
                            return (
                              <Button
                                key={p.id}
                                size="xs"
                                variant="subtle"
                                color="gray"
                                fullWidth
                                justify="flex-start"
                                onClick={() => { setPrompt(f.key, ''); close() }}
                              >
                                {p.name}
                              </Button>
                            )
                          }
                          return (
                            <Group key={p.id} gap={4} wrap="nowrap">
                              <Button
                                size="xs"
                                variant="subtle"
                                color="gray"
                                justify="flex-start"
                                style={{ flex: 1 }}
                                onClick={() => { setPrompt(f.key, p.text); close() }}
                              >
                                {p.name}
                              </Button>
                              <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="red"
                                aria-label="Delete preset"
                                onClick={(e) => { e.stopPropagation(); deletePreset(f.key, p.id); refresh() }}
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Group>
                          )
                        }}
                      />
                      <SavePresetControl
                        textBlank={!(local.prompts?.[f.key] || '').trim()}
                        onSave={(name) => savePreset(f.key, name, local.prompts?.[f.key] ?? '')}
                      />
                      <HistoryMenu
                        width={320}
                        load={() => listVersions(f.key)}
                        emptyText="No earlier versions yet."
                        trigger={(open) => (
                          <Button size="xs" variant="subtle" color="gray" leftSection={<IconHistory size={14} />} onClick={open}>
                            History
                          </Button>
                        )}
                        renderRow={(snap, { close, refresh }) => (
                          <Group key={snap.id} gap={4} wrap="nowrap" align="flex-start">
                            <Box
                              style={{ flex: 1, cursor: 'pointer', overflow: 'hidden' }}
                              onClick={() => { setPrompt(f.key, snap.text); close() }}
                            >
                              <Text size="xs" c="dimmed">{formatTs(snap.ts)} · {countWords(snap.text)} words</Text>
                              <Text size="xs" lineClamp={1}>{snap.text}</Text>
                            </Box>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="red"
                              aria-label="Delete version"
                              onClick={(e) => { e.stopPropagation(); deleteVersion(f.key, snap.id); refresh() }}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Group>
                        )}
                      />
                    </Group>
                    <Textarea
                      value={local.prompts?.[f.key] ?? ''}
                      onChange={(e) => setPrompt(f.key, e.currentTarget.value)}
                      placeholder={defaultPrompts?.[f.key] || 'Built-in default'}
                      autosize
                      minRows={f.minRows}
                      maxRows={16}
                    />
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => setPrompt(f.key, defaultPrompts?.[f.key] || '')}
                        disabled={!defaultPrompts?.[f.key]}
                      >
                        Load default into editor
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={() => setPrompt(f.key, '')}
                        disabled={!isCustom}
                      >
                        Reset to default
                      </Button>
                    </Group>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            )
          })}
        </Accordion>

        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function labelFor(presets, id) {
  return presets.find((p) => p.id === id)?.label || id
}

// Popover with a name field to save the current editor text as a named preset.
// Save is disabled when the editor is blank or the name is empty/whitespace.
function SavePresetControl({ textBlank, onSave }) {
  const [opened, setOpened] = useState(false)
  const [name, setName] = useState('')
  const canSave = !textBlank && name.trim().length > 0
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" withinPortal shadow="md" width={260}>
      <Popover.Target>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconDeviceFloppy size={14} />}
          onClick={() => setOpened((o) => !o)}
        >
          Save as preset
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <TextInput
            size="xs"
            label="Preset name"
            placeholder="My preset"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              size="xs"
              disabled={!canSave}
              onClick={() => { onSave(name.trim()); setName(''); setOpened(false) }}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
