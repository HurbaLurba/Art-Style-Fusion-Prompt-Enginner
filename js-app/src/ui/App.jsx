import React, { useEffect, useMemo, useState } from 'react'
import { EuiButton, EuiButtonEmpty, EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiHeader, EuiHeaderLogo, EuiHeaderSectionItem, EuiHeaderSectionItemButton, EuiPageTemplate, EuiSpacer, EuiText, EuiTitle, EuiSuperSelect, EuiFieldText, EuiModal, EuiModalHeader, EuiModalHeaderTitle, EuiModalBody, EuiModalFooter, EuiPanel, EuiTextArea, EuiFormRow, EuiIcon, EuiCopy } from '@elastic/eui'

const Storage = {
  getAll() {
    try { return JSON.parse(localStorage.getItem('artStyleFusionSettings')||'{}') } catch { return {} }
  },
  setAll(s) { localStorage.setItem('artStyleFusionSettings', JSON.stringify(s)) }
}

const fetchModels = async (ollamaUrl) => {
  const url = ollamaUrl ? `/api/models?ollama_url=${encodeURIComponent(ollamaUrl)}` : '/api/models'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load models')
  return res.json()
}

function isReady(settings){
  const hasOpenAI = settings.openai_api_key && settings.openai_model
  const hasOpenRouter = settings.openrouter_api_key && settings.openrouter_model
  const hasOllama = settings.ollama_base_url && settings.ollama_model
  return Boolean(hasOpenAI || hasOpenRouter || hasOllama)
}

export default function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [models, setModels] = useState({ openai: [], openrouter: [], ollama: [] })
  const [settings, setSettings] = useState(Storage.getAll())
  // unified page state
  const [file, setFile] = useState(null)
  const [manual, setManual] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [style, setStyle] = useState('')
  const [styleDesc, setStyleDesc] = useState('')
  const [artist, setArtist] = useState('')
  const [custom, setCustom] = useState('')
  const [flux, setFlux] = useState('')
  const [sdxl, setSdxl] = useState('')

  const [busyAnalyze, setBusyAnalyze] = useState(false)
  const [busyStyle, setBusyStyle] = useState(false)
  const [busyArtist, setBusyArtist] = useState(false)
  const [busyFlux, setBusyFlux] = useState(false)
  const [busySdxl, setBusySdxl] = useState(false)
  const ready = useMemo(() => isReady(settings), [settings])

  const steps = useMemo(() => ([
    { title: 'Image Analysis' },
    { title: 'Art Style' },
    { title: 'Artist Recommendation' },
    { title: 'T5/Flux Prompt' },
    { title: 'SDXL Prompt' },
  ]), [])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const m = await fetchModels(settings.ollama_base_url)
        if (mounted) setModels(m)
      } catch {
        try {
          const m2 = await fetchModels()
          if (mounted) setModels(m2)
        } catch {
          if (mounted) setModels({ openai: [], openrouter: [], ollama: [] })
        }
      }
    }
    load()
    // Prefill from env hints (optional)
    fetch('/api/env-hints').then(r=>r.json()).then(hints => {
      const next = { ...Storage.getAll() }
      if (hints.OPENAI_API_KEY && !next.openai_api_key) next.openai_api_key = hints.OPENAI_API_KEY
      if (hints.OPENROUTER_API_KEY && !next.openrouter_api_key) next.openrouter_api_key = hints.OPENROUTER_API_KEY
      if (hints.OLLAMA_BASE_URL && !next.ollama_base_url) next.ollama_base_url = hints.OLLAMA_BASE_URL
      Storage.setAll(next)
      setSettings(next)
    }).catch(()=>{})
    // Auto-open settings if not configured
    if (!isReady(Storage.getAll())) setShowSettings(true)
    return () => { mounted = false }
  }, [])

  const saveSettings = async (next) => {
    setSettings(next)
    Storage.setAll(next)
    try {
      const m = await fetchModels(next.ollama_base_url)
      setModels(m)
    } catch {}
    setShowSettings(false)
  }

  return (
    <EuiPageTemplate grow={false}>
      <EuiHeader position="fixed">
        <EuiHeaderSectionItem border="right">
          <EuiHeaderLogo iconType="logoElastic" href="#">Art Style Fusion</EuiHeaderLogo>
        </EuiHeaderSectionItem>
        <EuiHeaderSectionItem>
          <EuiButtonIcon iconType="gear" aria-label="AI Configuration" onClick={() => setShowSettings(true)} display="base" />
        </EuiHeaderSectionItem>
      </EuiHeader>

      <EuiPageTemplate.Section style={{ marginTop: 64 }}>
        <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
          <EuiFlexItem>
            <EuiTitle size="l"><h1>Create rich prompts</h1></EuiTitle>
            <EuiText color="subdued">All-in-one workspace: analyze or describe an image, pick a style, get artists, and generate prompts.</EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton fill size="s" onClick={() => setShowSettings(true)}>AI Configuration</EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        {!ready && (
          <>
            <EuiPanel color="warning">
              <EuiTitle size="s"><h3>AI Configuration required</h3></EuiTitle>
              <EuiText size="s" color="subdued">Please configure at least one provider (OpenAI, OpenRouter, or Ollama) to continue.</EuiText>
              <EuiSpacer size="s" />
              <EuiButton fill onClick={() => setShowSettings(true)}>Open AI Configuration</EuiButton>
            </EuiPanel>
            <EuiSpacer size="l" />
          </>
        )}

        <OnePageContent
          ready={ready}
          settings={settings}
          file={file}
          setFile={setFile}
          manual={manual}
          setManual={setManual}
          analysis={analysis}
          setAnalysis={setAnalysis}
          style={style}
          setStyle={setStyle}
          styleDesc={styleDesc}
          setStyleDesc={setStyleDesc}
          artist={artist}
          setArtist={setArtist}
          custom={custom}
          setCustom={setCustom}
          flux={flux}
          setFlux={setFlux}
          sdxl={sdxl}
          setSdxl={setSdxl}
          busy={{ analyze: busyAnalyze, style: busyStyle, artist: busyArtist, flux: busyFlux, sdxl: busySdxl }}
          setBusy={{ setAnalyze: setBusyAnalyze, setStyle: setBusyStyle, setArtist: setBusyArtist, setFlux: setBusyFlux, setSdxl: setBusySdxl }}
        />
      </EuiPageTemplate.Section>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
          models={models}
          settings={settings}
        />
      )}
    </EuiPageTemplate>
  )
}

function SettingsModal({ onClose, onSave, models, settings }) {
  const [local, setLocal] = useState({ ...settings })
  const [provider, setProvider] = useState(settings.provider||'')
  const [testing, setTesting] = useState({ openai:false, openrouter:false, ollama:false })
  const [loadingModels, setLoadingModels] = useState(false)
  const set = (k, v) => setLocal(p => ({ ...p, [k]: v }))
  const selectProvider = (p) => { setProvider(p); set('provider', p) }

  const testOpenAI = async () => {
    setTesting(t=>({ ...t, openai:true }))
    try {
      const r = await fetch('/api/test/openai', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ apiKey: local.openai_api_key }) })
      const d = await r.json()
      alert(d.ok ? `OpenAI OK. Models: ${d.count}` : `OpenAI failed: ${d.error}`)
    } finally { setTesting(t=>({ ...t, openai:false })) }
  }
  const loadOpenAIModels = async () => {
    setLoadingModels(true)
    try {
      const r = await fetch(`/api/models/openai?apiKey=${encodeURIComponent(local.openai_api_key||'')}`)
      const d = await r.json()
      if (d.models) setLocal(p=>({ ...p, openai_models_dynamic: d.models }))
    } finally { setLoadingModels(false) }
  }

  const testOpenRouter = async () => {
    setTesting(t=>({ ...t, openrouter:true }))
    try {
      const r = await fetch('/api/test/openrouter', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ apiKey: local.openrouter_api_key }) })
      const d = await r.json()
      alert(d.ok ? `OpenRouter OK. Models: ${d.count}` : `OpenRouter failed: ${d.error}`)
    } finally { setTesting(t=>({ ...t, openrouter:false })) }
  }
  const loadOpenRouterModels = async () => {
    setLoadingModels(true)
    try {
      const r = await fetch(`/api/models/openrouter?apiKey=${encodeURIComponent(local.openrouter_api_key||'')}`)
      const d = await r.json()
      if (d.models) setLocal(p=>({ ...p, openrouter_models_dynamic: d.models }))
    } finally { setLoadingModels(false) }
  }

  const testOllama = async () => {
    setTesting(t=>({ ...t, ollama:true }))
    try {
      const r = await fetch('/api/test/ollama', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ baseUrl: local.ollama_base_url }) })
      const d = await r.json()
      alert(d.ok ? `Ollama OK. Models: ${d.count}` : `Ollama failed: ${d.error}`)
    } finally { setTesting(t=>({ ...t, ollama:false })) }
  }
  const loadOllamaModels = async () => {
    setLoadingModels(true)
    try {
      const r = await fetch(`/api/models?ollama_url=${encodeURIComponent(local.ollama_base_url||'')}`)
      const d = await r.json()
      if (d.ollama) setLocal(p=>({ ...p, ollama_models_dynamic: d.ollama }))
    } finally { setLoadingModels(false) }
  }

  return (
    <EuiModal onClose={onClose}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>AI Configuration</EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiText size="s" color="subdued">Configure any one provider below. All fields are optional except you must pick a model for the provider you want to use.</EuiText>
        <EuiSpacer size="m" />
        <EuiTitle size="xs"><h3>Choose provider</h3></EuiTitle>
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem grow={false}><EuiButtonEmpty onClick={()=>selectProvider('openai')} isSelected={provider==='openai'}>OpenAI</EuiButtonEmpty></EuiFlexItem>
          <EuiFlexItem grow={false}><EuiButtonEmpty onClick={()=>selectProvider('openrouter')} isSelected={provider==='openrouter'}>OpenRouter</EuiButtonEmpty></EuiFlexItem>
          <EuiFlexItem grow={false}><EuiButtonEmpty onClick={()=>selectProvider('ollama')} isSelected={provider==='ollama'}>Ollama</EuiButtonEmpty></EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer />

        <EuiTitle size="xs"><h3>OpenAI</h3></EuiTitle>
        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem grow={2}>
            <EuiFormRow label="API Key">
              <EuiFieldText value={local.openai_api_key||''} onChange={e=>set('openai_api_key', e.target.value)} type="password" placeholder="sk-..."/>
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow label="Model">
              <EuiSuperSelect
                options={[{ value: '', inputDisplay: 'Select a model' }, ...((local.openai_models_dynamic||models.openai).map(m=>({ value: m.value, inputDisplay: m.label })))]}
                valueOfSelected={local.openai_model||''}
                onChange={v=>set('openai_model', v)}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSpacer size="m" />
            <EuiButton size="s" onClick={testOpenAI} isLoading={testing.openai}>Test</EuiButton>
            <EuiSpacer size="s" />
            <EuiButton size="s" onClick={loadOpenAIModels} isLoading={loadingModels}>Load Models</EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer />

  <EuiTitle size="xs"><h3>OpenRouter</h3></EuiTitle>
        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem grow={2}>
            <EuiFormRow label="API Key">
              <EuiFieldText value={local.openrouter_api_key||''} onChange={e=>set('openrouter_api_key', e.target.value)} type="password" placeholder="sk-or-v1-..."/>
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow label="Model">
              <EuiSuperSelect
                options={[{ value: '', inputDisplay: 'Select a model' }, ...((local.openrouter_models_dynamic||models.openrouter).map(m=>({ value: m.value, inputDisplay: m.label })))]}
                valueOfSelected={local.openrouter_model||''}
                onChange={v=>set('openrouter_model', v)}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSpacer size="m" />
            <EuiButton size="s" onClick={testOpenRouter} isLoading={testing.openrouter}>Test</EuiButton>
            <EuiSpacer size="s" />
            <EuiButton size="s" onClick={loadOpenRouterModels} isLoading={loadingModels}>Load Models</EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer />

  <EuiTitle size="xs"><h3>Ollama</h3></EuiTitle>
        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem grow={2}>
            <EuiFormRow label="Server URL">
              <EuiFieldText value={local.ollama_base_url||''} onChange={e=>set('ollama_base_url', e.target.value)} placeholder="http://localhost:11434"/>
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow label="Model">
              <EuiSuperSelect
                options={[{ value: '', inputDisplay: 'Select a model' }, ...((local.ollama_models_dynamic||models.ollama).map(m=>({ value: m.value, inputDisplay: m.label })))]}
                valueOfSelected={local.ollama_model||''}
                onChange={v=>set('ollama_model', v)}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSpacer size="m" />
            <EuiButton size="s" onClick={testOllama} isLoading={testing.ollama}>Test</EuiButton>
            <EuiSpacer size="s" />
            <EuiButton size="s" onClick={loadOllamaModels} isLoading={loadingModels}>Load Models</EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose}>Cancel</EuiButtonEmpty>
        <EuiButton fill onClick={()=>onSave({ ...local, provider })} isDisabled={!provider}>
          Save
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  )
}

function OnePageContent({ ready, settings, file, setFile, manual, setManual, analysis, setAnalysis, style, setStyle, styleDesc, setStyleDesc, artist, setArtist, custom, setCustom, flux, setFlux, sdxl, setSdxl, busy, setBusy }) {
  const analyze = async () => {
    setBusy.setAnalyze(true)
    try {
      const form = new FormData()
      form.append('settings', JSON.stringify(settings))
      form.append('image', file)
      const res = await fetch('/api/analyze-image', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error||'Failed')
      setAnalysis(data.analysis)
    } catch (e) {
      setAnalysis(`Error: ${e.message}`)
    } finally { setBusy.setAnalyze(false) }
  }
  const useManual = () => setAnalysis(manual)

  const genStyle = async () => {
    setBusy.setStyle(true)
    try {
      const res = await fetch('/api/generate-style-description', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ style, settings }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error||'Failed')
      setStyleDesc(data.description)
    } catch(e){ setStyleDesc(`Error: ${e.message}`) } finally { setBusy.setStyle(false) }
  }
  const genArtist = async () => {
    setBusy.setArtist(true)
    try {
      const res = await fetch('/api/recommend-artist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings,
          style,
          styleDescription: styleDesc,
          imageDescription: analysis,
          themes: custom
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error||'Failed')
      setArtist(data.recommendation || data.artist)
    } catch(e){ setArtist(`Error: ${e.message}`) } finally { setBusy.setArtist(false) }
  }
  const genFlux = async () => {
    setBusy.setFlux(true)
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
          settings
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error||'Failed')
      setFlux(data.prompt)
    } catch(e){ setFlux(`Error: ${e.message}`) } finally { setBusy.setFlux(false) }
  }
  const genSdxl = async () => {
    setBusy.setSdxl(true)
    try {
      const res = await fetch('/api/generate-sdxl-prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings, fluxPrompt: flux }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error||'Failed')
      setSdxl(data.prompt)
    } catch(e){ setSdxl(`Error: ${e.message}`) } finally { setBusy.setSdxl(false) }
  }

  return (
    <>
      {/* Image Analysis & Manual Description */}
      <EuiPanel>
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}><EuiIcon type="image" /></EuiFlexItem>
          <EuiFlexItem><EuiTitle size="s"><h3>Image analysis</h3></EuiTitle></EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiFormRow label="Upload image">
              <input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)} />
            </EuiFormRow>
            <EuiButton onClick={analyze} isLoading={busy.analyze} isDisabled={!ready || !file}>Analyze Image</EuiButton>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow label="Manual description">
              <EuiTextArea value={manual} onChange={e=>setManual(e.target.value)} rows={6} />
            </EuiFormRow>
            <EuiButtonEmpty onClick={useManual} isDisabled={!ready || !manual.trim()}>Use Manual Description</EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
        {analysis && (<EuiPanel color="success"><EuiText><pre style={{whiteSpace:'pre-wrap'}}>{analysis}</pre></EuiText></EuiPanel>)}
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Art Style */}
      <EuiPanel>
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}><EuiIcon type="brush" /></EuiFlexItem>
          <EuiFlexItem><EuiTitle size="s"><h3>Art style</h3></EuiTitle></EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiFormRow label="Style">
          <EuiFieldText value={style} onChange={e=>setStyle(e.target.value)} placeholder="Impressionism, Cyberpunk, Art Nouveau" />
        </EuiFormRow>
        <EuiButton onClick={genStyle} isLoading={busy.style} isDisabled={!ready || !style.trim()}>Generate Style Description</EuiButton>
        <EuiSpacer />
        {styleDesc && (<EuiPanel color="success"><EuiText><pre style={{whiteSpace:'pre-wrap'}}>{styleDesc}</pre></EuiText></EuiPanel>)}
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Artist Recommendation */}
      <EuiPanel>
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}><EuiIcon type="user" /></EuiFlexItem>
          <EuiFlexItem><EuiTitle size="s"><h3>Artist recommendation</h3></EuiTitle></EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiButton onClick={genArtist} isLoading={busy.artist} isDisabled={!ready}>Recommend Artist</EuiButton>
        <EuiSpacer />
        {artist && (<EuiPanel color="success"><EuiText><pre style={{whiteSpace:'pre-wrap'}}>{artist}</pre></EuiText></EuiPanel>)}
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Flux Prompt */}
      <EuiPanel>
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}><EuiIcon type="bolt" /></EuiFlexItem>
          <EuiFlexItem><EuiTitle size="s"><h3>Flux prompt</h3></EuiTitle></EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiFormRow label="Additional requirements (optional)">
          <EuiTextArea value={custom} onChange={e=>setCustom(e.target.value)} rows={4} />
        </EuiFormRow>
        <EuiButton onClick={genFlux} isLoading={busy.flux} isDisabled={!ready}>Generate Flux Prompt</EuiButton>
        <EuiSpacer />
        {flux && (
          <EuiPanel color="success">
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" gutterSize="s">
              <EuiFlexItem grow={false}><EuiTitle size="xxs"><h4>T5/Flux</h4></EuiTitle></EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiCopy textToCopy={flux}>
                  {(copy)=> (<EuiButtonEmpty size="s" iconType="copyClipboard" onClick={copy}>Copy</EuiButtonEmpty>)}
                </EuiCopy>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiText><pre style={{whiteSpace:'pre-wrap'}}>{flux}</pre></EuiText>
          </EuiPanel>
        )}
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* SDXL Prompt */}
      <EuiPanel>
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}><EuiIcon type="beaker" /></EuiFlexItem>
          <EuiFlexItem><EuiTitle size="s"><h3>SDXL prompt</h3></EuiTitle></EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiButton onClick={genSdxl} isLoading={busy.sdxl} isDisabled={!ready || !flux}>Generate SDXL from Flux</EuiButton>
        <EuiSpacer />
        {sdxl && (
          <EuiPanel color="success">
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" gutterSize="s">
              <EuiFlexItem grow={false}><EuiTitle size="xxs"><h4>SDXL</h4></EuiTitle></EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiCopy textToCopy={sdxl}>
                  {(copy)=> (<EuiButtonEmpty size="s" iconType="copyClipboard" onClick={copy}>Copy</EuiButtonEmpty>)}
                </EuiCopy>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiText><pre style={{whiteSpace:'pre-wrap'}}>{sdxl}</pre></EuiText>
          </EuiPanel>
        )}
      </EuiPanel>
    </>
  )
}
