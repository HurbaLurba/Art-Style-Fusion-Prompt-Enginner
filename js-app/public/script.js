class ArtStyleFusionApp {
    constructor() {
        this.currentStep = 1;
        this.imageAnalysis = '';
        this.artStyle = '';
        this.styleDescription = '';
        this.artistRecommendation = '';
        this.fluxPrompt = '';
        this.sdxlPrompt = '';
        this.uploadedImage = null;
        
        this.settings = new SettingsManager();
        this.init();
    }

    async init() {
        try {
            await this.loadModels();
            this.setupEventListeners();
            this.showStep(1);
            this.showToast('Application loaded successfully!', 'success');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showToast('Failed to initialize application', 'error');
        }
    }

    async loadModels() {
        try {
            const response = await fetch('/api/models');
            if (!response.ok) {
                throw new Error('Failed to load models');
            }
            
            const models = await response.json();
            this.populateModelDropdowns(models);
        } catch (error) {
            console.error('Error loading models:', error);
            // Use default models if loading fails
            const defaultModels = {
                openai: [
                    { value: 'gpt-4', label: 'GPT-4' },
                    { value: 'gpt-4-vision-preview', label: 'GPT-4 Vision' },
                    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
                ],
                openrouter: [
                    { value: 'openai/gpt-4', label: 'OpenAI GPT-4' },
                    { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus' },
                    { value: 'anthropic/claude-3-sonnet', label: 'Claude 3 Sonnet' }
                ],
                ollama: [
                    { value: 'llava', label: 'LLaVA (Vision)' },
                    { value: 'llama3', label: 'Llama 3' },
                    { value: 'mistral', label: 'Mistral' }
                ]
            };
            this.populateModelDropdowns(defaultModels);
        }
    }

    populateModelDropdowns(models) {
        // Populate OpenAI models
        const openaiSelect = document.getElementById('openaiModel');
        if (openaiSelect) {
            openaiSelect.innerHTML = '<option value=\"\">Select a model</option>';
            models.openai.forEach(model => {
                const option = document.createElement('option');
                option.value = model.value;
                option.textContent = model.label;
                openaiSelect.appendChild(option);
            });
        }

        // Populate OpenRouter models
        const openrouterSelect = document.getElementById('openrouterModel');
        if (openrouterSelect) {
            openrouterSelect.innerHTML = '<option value=\"\">Select a model</option>';
            models.openrouter.forEach(model => {
                const option = document.createElement('option');
                option.value = model.value;
                option.textContent = model.label;
                openrouterSelect.appendChild(option);
            });
        }

        // Populate Ollama models
        const ollamaSelect = document.getElementById('ollamaModel');
        if (ollamaSelect) {
            ollamaSelect.innerHTML = '<option value=\"\">Select a model</option>';
            models.ollama.forEach(model => {
                const option = document.createElement('option');
                option.value = model.value;
                option.textContent = model.label;
                ollamaSelect.appendChild(option);
            });
        }
    }

    setupEventListeners() {
    // Settings
    const settingsBtn = document.getElementById('settingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => this.openSettings());
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    if (cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', () => this.closeSettings());

        // Ollama URL change to reload models
        document.getElementById('ollamaUrl').addEventListener('blur', () => this.reloadOllamaModels());
        document.getElementById('ollamaUrl').addEventListener('change', () => this.reloadOllamaModels());

        // Tab switching
    const uploadTabBtn = document.getElementById('uploadTab');
    const manualTabBtn = document.getElementById('manualTab');
    if (uploadTabBtn) uploadTabBtn.addEventListener('click', () => this.switchTab('upload'));
    if (manualTabBtn) manualTabBtn.addEventListener('click', () => this.switchTab('manual'));

    // Image upload
        const imageInput = document.getElementById('imageInput');
        const selectImageBtn = document.getElementById('selectImageBtn');
        const uploadArea = document.getElementById('uploadArea');
        const removeImageBtn = document.getElementById('removeImageBtn');
    const manualDescription = document.getElementById('manualDescription');
    const useManualBtn = document.getElementById('useManualBtn');

    if (selectImageBtn) selectImageBtn.addEventListener('click', () => imageInput.click());
    if (imageInput) imageInput.addEventListener('change', (e) => this.handleImageUpload(e.target.files[0]));
    if (removeImageBtn) removeImageBtn.addEventListener('click', () => this.removeImage());

        // Drag and drop
        if (uploadArea) {
            uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
            uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
            uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        }

        // Step actions
        const analyzeBtn = document.getElementById('analyzeBtn');
        if (analyzeBtn) analyzeBtn.addEventListener('click', () => this.analyzeImage());
        if (useManualBtn) {
            useManualBtn.disabled = true;
            useManualBtn.addEventListener('click', () => this.useManualDescription());
        }
        if (manualDescription) {
            manualDescription.disabled = false;
            manualDescription.addEventListener('input', () => {
                if (useManualBtn) useManualBtn.disabled = manualDescription.value.trim().length === 0;
            });
        }
        
        // Art style input
        const artStyleInput = document.getElementById('artStyleInput');
        artStyleInput.addEventListener('input', () => {
            const generateBtn = document.getElementById('generateStyleBtn');
            generateBtn.disabled = !artStyleInput.value.trim();
        });
        document.getElementById('generateStyleBtn').addEventListener('click', () => this.generateStyleDescription());
        
        // Other step buttons
        document.getElementById('recommendArtistBtn').addEventListener('click', () => this.recommendArtist());
        document.getElementById('generateFluxPromptBtn').addEventListener('click', () => this.generateFluxPrompt());
        document.getElementById('generateSDXLPromptBtn').addEventListener('click', () => this.generateSDXLPrompt());
        
        // Copy and download buttons
        document.getElementById('copyFluxPromptBtn').addEventListener('click', () => this.copyToClipboard('flux'));
        document.getElementById('downloadFluxPromptBtn').addEventListener('click', () => this.downloadPrompt('flux'));
        document.getElementById('copySDXLPromptBtn').addEventListener('click', () => this.copyToClipboard('sdxl'));
        document.getElementById('downloadSDXLPromptBtn').addEventListener('click', () => this.downloadPrompt('sdxl'));

        // Close modal when clicking outside
        document.getElementById('settingsModal').addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') {
                this.closeSettings();
            }
        });
    }

    showStep(stepNumber) {
        // Hide all steps
        for (let i = 1; i <= 5; i++) {
            const step = document.getElementById(`step${i}`);
            if (step) {
                step.style.display = i === stepNumber ? 'block' : 'none';
                step.classList.toggle('active', i === stepNumber);
            }
        }
        this.currentStep = stepNumber;
    }

    switchTab(tabType) {
        const uploadTab = document.getElementById('uploadTab');
        const manualTab = document.getElementById('manualTab');
        const uploadContent = document.getElementById('uploadContent');
        const manualContent = document.getElementById('manualContent');

        if (tabType === 'upload') {
            uploadTab.classList.add('active');
            manualTab.classList.remove('active');
            uploadContent.classList.remove('hidden');
            manualContent.classList.add('hidden');
        } else {
            manualTab.classList.add('active');
            uploadTab.classList.remove('active');
            manualContent.classList.remove('hidden');
            uploadContent.classList.add('hidden');
        }
    }

    handleImageUpload(file) {
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            this.showToast('File size must be less than 10MB', 'error');
            return;
        }

        this.uploadedImage = file;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById('uploadedImage');
            const container = document.getElementById('uploadedImageContainer');
            const placeholder = document.querySelector('.upload-placeholder');
            
            img.src = e.target.result;
            container.style.display = 'block';
            placeholder.style.display = 'none';
            
            document.getElementById('analyzeBtn').disabled = false;
        };
        reader.readAsDataURL(file);
    }

    removeImage() {
        this.uploadedImage = null;
        const container = document.getElementById('uploadedImageContainer');
        const placeholder = document.querySelector('.upload-placeholder');
        
        container.style.display = 'none';
        placeholder.style.display = 'block';
        document.getElementById('analyzeBtn').disabled = true;
        document.getElementById('imageInput').value = '';
    }

    handleDragOver(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.handleImageUpload(files[0]);
        }
    }

    async analyzeImage() {
        if (!this.uploadedImage) return;

        this.showLoading('Analyzing image...');

        try {
            const formData = new FormData();
            formData.append('image', this.uploadedImage);
            
            const userSettings = this.settings.getAll();
            formData.append('settings', JSON.stringify(userSettings));

            const response = await fetch('/api/analyze-image', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to analyze image');
            }

            const data = await response.json();
            this.imageAnalysis = data.analysis;

            document.getElementById('imageAnalysisContent').textContent = data.analysis;
            document.getElementById('imageAnalysisResult').style.display = 'block';
            
            this.showToast('Image analyzed successfully!', 'success');
            this.showStep(2);
            
        } catch (error) {
            console.error('Analysis error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    useManualDescription() {
        const description = document.getElementById('manualDescription').value.trim();
        if (!description) {
            this.showToast('Please enter a description', 'error');
            return;
        }

        this.imageAnalysis = description;
        document.getElementById('imageAnalysisContent').textContent = description;
        document.getElementById('imageAnalysisResult').style.display = 'block';
        
        this.showToast('Manual description saved!', 'success');
        this.showStep(2);
    }

    async generateStyleDescription() {
        const style = document.getElementById('artStyleInput').value.trim();
        if (!style) return;

        this.artStyle = style;
        this.showLoading('Generating style description...');

        try {
            const userSettings = this.settings.getAll();
            const response = await fetch('/api/generate-style-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    style: style,
                    settings: userSettings
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate style description');
            }

            const data = await response.json();
            this.styleDescription = data.description;

            document.getElementById('styleDescriptionContent').textContent = data.description;
            document.getElementById('styleDescriptionResult').style.display = 'block';
            
            this.showToast('Style description generated!', 'success');
            this.showStep(3);
            
        } catch (error) {
            console.error('Style description error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async recommendArtist() {
        if (!this.imageAnalysis || !this.artStyle) {
            this.showToast('Complete previous steps first', 'error');
            return;
        }

        this.showLoading('Finding artist recommendation...');

        try {
            const userSettings = this.settings.getAll();
            const response = await fetch('/api/recommend-artist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    style: this.artStyle,
                    themes: this.imageAnalysis,
                    settings: userSettings
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to recommend artist');
            }

            const data = await response.json();
            this.artistRecommendation = data.recommendation;

            document.getElementById('artistRecommendationContent').textContent = data.recommendation;
            document.getElementById('artistRecommendationResult').style.display = 'block';
            
            this.showToast('Artist recommendation generated!', 'success');
            this.showStep(4);
            
        } catch (error) {
            console.error('Artist recommendation error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async generateFluxPrompt() {
        if (!this.imageAnalysis || !this.artStyle || !this.artistRecommendation) {
            this.showToast('Complete previous steps first', 'error');
            return;
        }

        this.showLoading('Generating T5/Flux prompt...');

        try {
            const customInputs = document.getElementById('customInputs').value;
            const userSettings = this.settings.getAll();
            
            const response = await fetch('/api/generate-flux-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    style: this.artStyle,
                    imageDescription: this.imageAnalysis,
                    styleDescription: this.styleDescription,
                    artistRecommendation: this.artistRecommendation,
                    customInputs: customInputs,
                    settings: userSettings
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate Flux prompt');
            }

            const data = await response.json();
            this.fluxPrompt = data.prompt;

            document.getElementById('fluxPromptContent').textContent = data.prompt;
            document.getElementById('fluxPromptResult').style.display = 'block';
            
            this.showToast('T5/Flux prompt generated!', 'success');
            this.showStep(5);
            
        } catch (error) {
            console.error('Flux prompt generation error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async generateSDXLPrompt() {
        if (!this.fluxPrompt) {
            this.showToast('Generate Flux prompt first', 'error');
            return;
        }

        this.showLoading('Converting to SDXL format...');

        try {
            const userSettings = this.settings.getAll();
            const response = await fetch('/api/generate-sdxl-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fluxPrompt: this.fluxPrompt,
                    settings: userSettings
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate SDXL prompt');
            }

            const data = await response.json();
            this.sdxlPrompt = data.prompt;

            document.getElementById('sdxlPromptContent').textContent = data.prompt;
            document.getElementById('sdxlPromptResult').style.display = 'block';
            
            this.showToast('SDXL prompt generated!', 'success');
            
        } catch (error) {
            console.error('SDXL prompt generation error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async copyToClipboard(type) {
        const text = type === 'flux' ? this.fluxPrompt : this.sdxlPrompt;
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            this.showToast(`${type.toUpperCase()} prompt copied to clipboard!`, 'success');
        } catch (error) {
            console.error('Copy error:', error);
            this.showToast('Failed to copy to clipboard', 'error');
        }
    }

    downloadPrompt(type) {
        const text = type === 'flux' ? this.fluxPrompt : this.sdxlPrompt;
        if (!text) return;

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}-prompt.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast(`${type.toUpperCase()} prompt downloaded!`, 'success');
    }

    // Settings methods
    openSettings() {
        const modal = document.getElementById('settingsModal');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.loadSettingsIntoForm();
    }

    closeSettings() {
        const modal = document.getElementById('settingsModal');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    loadSettingsIntoForm() {
        const settings = this.settings.getAll();
        
        if (settings.openai_api_key) {
            document.getElementById('openaiKey').value = settings.openai_api_key;
        }
        if (settings.openai_model) {
            document.getElementById('openaiModel').value = settings.openai_model;
        }
        if (settings.openrouter_api_key) {
            document.getElementById('openrouterKey').value = settings.openrouter_api_key;
        }
        if (settings.openrouter_model) {
            document.getElementById('openrouterModel').value = settings.openrouter_model;
        }
        if (settings.ollama_base_url) {
            document.getElementById('ollamaUrl').value = settings.ollama_base_url;
        }
        if (settings.ollama_model) {
            document.getElementById('ollamaModel').value = settings.ollama_model;
        }
    }

    saveSettings() {
        const newSettings = {
            openai_api_key: document.getElementById('openaiKey').value.trim(),
            openai_model: document.getElementById('openaiModel').value,
            openrouter_api_key: document.getElementById('openrouterKey').value.trim(),
            openrouter_model: document.getElementById('openrouterModel').value,
            ollama_base_url: document.getElementById('ollamaUrl').value.trim(),
            ollama_model: document.getElementById('ollamaModel').value
        };

        Object.entries(newSettings).forEach(([key, value]) => {
            if (value) {
                this.settings.set(key, value);
            } else {
                this.settings.remove(key);
            }
        });

        this.showToast('Settings saved successfully!', 'success');
        this.closeSettings();
    }

    async reloadOllamaModels() {
        const ollamaUrl = document.getElementById('ollamaUrl').value.trim();
        if (!ollamaUrl) return;

        try {
            const response = await fetch(`/api/models?ollama_url=${encodeURIComponent(ollamaUrl)}`);
            if (!response.ok) {
                throw new Error('Failed to load Ollama models');
            }
            
            const models = await response.json();
            
            // Update only the Ollama dropdown
            const ollamaSelect = document.getElementById('ollamaModel');
            if (ollamaSelect && models.ollama) {
                ollamaSelect.innerHTML = '<option value="">Select a model</option>';
                models.ollama.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.value;
                    option.textContent = model.label;
                    ollamaSelect.appendChild(option);
                });
                this.showToast('Ollama models updated!', 'success');
            }
        } catch (error) {
            console.error('Error reloading Ollama models:', error);
            this.showToast('Failed to load Ollama models', 'error');
        }
    }

    showLoading(message) {
        const overlay = document.getElementById('loadingOverlay');
        const messageEl = document.getElementById('loadingMessage');
        messageEl.textContent = message;
    overlay.classList.add('show');
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
    overlay.classList.remove('show');
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class=\"${icons[type]}\"></i>
            <span>${message}</span>
        `;

        toastContainer.appendChild(toast);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);

        // Allow manual dismissal
        toast.addEventListener('click', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }
}

// Settings Manager
class SettingsManager {
    constructor() {
        this.storageKey = 'artStyleFusionSettings';
    }

    set(key, value) {
        const settings = this.getAll();
        settings[key] = value;
        localStorage.setItem(this.storageKey, JSON.stringify(settings));
    }

    get(key) {
        const settings = this.getAll();
        return settings[key];
    }

    getAll() {
        try {
            const settings = localStorage.getItem(this.storageKey);
            return settings ? JSON.parse(settings) : {};
        } catch (error) {
            console.error('Error loading settings:', error);
            return {};
        }
    }

    remove(key) {
        const settings = this.getAll();
        delete settings[key];
        localStorage.setItem(this.storageKey, JSON.stringify(settings));
    }

    clear() {
        localStorage.removeItem(this.storageKey);
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ArtStyleFusionApp();
});
