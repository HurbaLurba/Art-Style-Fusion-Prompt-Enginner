// Browser-only history + preset store for Art Style Fusion.
//
// Two independent feature stores, each under its OWN per-section / per-field
// localStorage key so a large write (e.g. a ~4000-token analysis) only
// re-serializes that one bucket and can never corrupt settings/session or
// another section. Every write is quota-safe and fire-and-forget: on failure it
// degrades to "no history recorded" and never throws into a React handler.
//
// Nothing here touches 'artStyleFusionSettings' or 'artStyleFusionSession'.
// The server stores nothing — this is the entire persistence layer for history.

const OUT_KEY = (section) => `asf:hist:${section}`
const PROMPT_KEY = (field) => `asf:prompt:${field}`

// Per-section output caps. Analysis entries are large (~16-24KB) so we keep
// fewer of them; the shorter prompt outputs keep more.
const SECTION_CAPS = { analysis: 10, styleDesc: 30, artist: 30, flux: 30, sdxl: 30 }
const DEFAULT_CAP = 30
const MAX_ENTRY_CHARS = 40000

const PRESET_CAP = 15
const VERSION_CAP = 15
const MAX_PROMPT_CHARS = 20000

// Math.random / Date.now are fine here — this is browser app runtime, not a
// workflow script.
function rand36(n) {
  let s = ''
  while (s.length < n) s += Math.random().toString(36).slice(2)
  return s.slice(0, n)
}

function newId() {
  return `${Date.now()}-${rand36(6)}`
}

function words(t) {
  return (t || '').trim().split(/\s+/).filter(Boolean).length
}

function isQuotaError(e) {
  return Boolean(e) && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)
}

function capFor(section) {
  return SECTION_CAPS[section] || DEFAULT_CAP
}

// Well-formed guards: readers drop any element that isn't a proper object with a
// string id + text, so externally-tampered or cross-version data can never crash
// a React render (e.g. `[null]` -> entry.text throws).
const okEntry = (e) => Boolean(e) && typeof e === 'object' && typeof e.id === 'string' && typeof e.text === 'string'

// ---- array store (output history) -------------------------------------------

function readArr(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(v) ? v.filter(okEntry) : []
  } catch {
    return []
  }
}

// Quota-safe: on QuotaExceededError drop the oldest (tail of a newest-first
// array) and retry, bounded. Returns the array actually persisted, or null if
// nothing could be written (storage disabled / hard failure). Never throws.
function writeArr(key, arr) {
  let list = arr
  for (let i = 0; i < 60; i++) {
    try {
      localStorage.setItem(key, JSON.stringify(list))
      return list
    } catch (e) {
      if (isQuotaError(e) && list.length > 1) {
        list = list.slice(0, -1)
        continue
      }
      return null
    }
  }
  return null
}

export function pushOutput(section, text, meta, source) {
  // Truncate ONCE up front so entry.text, the word count, and the dedupe check
  // all operate on the exact same stored string.
  const stored = (text || '').slice(0, MAX_ENTRY_CHARS)
  const t = stored.trim()
  if (!t) return listOutput(section).length
  const list = readArr(OUT_KEY(section))
  if (list[0] && (list[0].text || '').trim() === t) return list.length // consecutive dedupe
  const entry = {
    id: newId(),
    ts: Date.now(),
    text: stored,
    words: words(stored),
    provider: meta?.provider ?? null,
    model: meta?.model ?? null,
    tokens: meta?.tokens ?? null,
  }
  if (source) entry.source = source
  const next = [entry, ...list].slice(0, capFor(section))
  const saved = writeArr(OUT_KEY(section), next)
  // Report the length actually persisted: on failure storage still holds the
  // prior `list`, so the count never overstates what a later reader will show.
  return (saved || list).length
}

export function listOutput(section) {
  return readArr(OUT_KEY(section)).slice(0, capFor(section))
}

export function removeOutput(section, id) {
  const next = readArr(OUT_KEY(section)).filter((e) => e.id !== id)
  const saved = writeArr(OUT_KEY(section), next)
  // On write failure the delete didn't persist; report the real stored length.
  return (saved || readArr(OUT_KEY(section))).length
}

export function clearOutput(section) {
  try {
    localStorage.removeItem(OUT_KEY(section))
  } catch {
    /* ignore */
  }
  return 0
}

// ---- object store (prompt presets + version history) ------------------------

function readPromptStore(field) {
  try {
    const v = JSON.parse(localStorage.getItem(PROMPT_KEY(field)) || 'null')
    if (v && typeof v === 'object') {
      return {
        presets: Array.isArray(v.presets) ? v.presets.filter((p) => okEntry(p) && typeof p.name === 'string') : [],
        history: Array.isArray(v.history) ? v.history.filter(okEntry) : [],
      }
    }
  } catch {
    /* ignore */
  }
  return { presets: [], history: [] }
}

// Quota-safe: shed version history first, presets only as a last resort.
function writePromptStore(field, store) {
  const key = PROMPT_KEY(field)
  let s = store
  for (let i = 0; i < 60; i++) {
    try {
      localStorage.setItem(key, JSON.stringify(s))
      return true
    } catch (e) {
      if (isQuotaError(e) && s.history.length > 0) { s = { ...s, history: s.history.slice(0, -1) }; continue }
      if (isQuotaError(e) && s.presets.length > 0) { s = { ...s, presets: s.presets.slice(0, -1) }; continue }
      return false
    }
  }
  return false
}

export function listPresets(field) {
  return readPromptStore(field).presets
}

export function listVersions(field) {
  return readPromptStore(field).history
}

export function savePreset(field, name, text) {
  const nm = (name || '').trim()
  if (!nm) return
  const store = readPromptStore(field)
  const preset = { id: newId(), name: nm, text: (text || '').slice(0, MAX_PROMPT_CHARS), ts: Date.now() }
  // Name-dedupe (case-insensitive): update-and-move-to-front instead of duplicating.
  const rest = store.presets.filter((p) => (p.name || '').trim().toLowerCase() !== nm.toLowerCase())
  const presets = [preset, ...rest].slice(0, PRESET_CAP)
  writePromptStore(field, { ...store, presets })
}

export function deletePreset(field, id) {
  const store = readPromptStore(field)
  writePromptStore(field, { ...store, presets: store.presets.filter((p) => p.id !== id) })
}

export function pushPromptVersion(field, priorText) {
  const stored = (priorText || '').slice(0, MAX_PROMPT_CHARS)
  const t = stored.trim()
  if (!t) return
  const store = readPromptStore(field)
  if (store.history[0] && (store.history[0].text || '').trim() === t) return // consecutive dedupe
  const snap = { id: newId(), ts: Date.now(), text: stored }
  const history = [snap, ...store.history].slice(0, VERSION_CAP)
  writePromptStore(field, { ...store, history })
}

export function deleteVersion(field, id) {
  const store = readPromptStore(field)
  writePromptStore(field, { ...store, history: store.history.filter((h) => h.id !== id) })
}
