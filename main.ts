import { App, Plugin, PluginSettingTab, Setting, TFile, Modal, Notice, FileSystemAdapter } from 'obsidian';
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';

interface SpeedReaderSettings {
    wordsPerMinute: number;
    highlightColor: string;
    chunkSize: number;
    autoAdvance: boolean;
}

const DEFAULT_SETTINGS: SpeedReaderSettings = {
    wordsPerMinute: 250,
    highlightColor: '#ff6b6b',
    chunkSize: 1,
    autoAdvance: true
};

export default class SpeedReaderPlugin extends Plugin {
    settings: SpeedReaderSettings;

    async onload() {
        await this.loadSettings();

        // Add command to open speed reader
        this.addCommand({
            id: 'open-speed-reader',
            name: 'Open Speed Reader',
            callback: () => {
                new SpeedReaderModal(this.app, this.settings).open();
            }
        });

        // Add command to speed read current file
        this.addCommand({
            id: 'speed-read-current-file',
            name: 'Speed Read Current File',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    await this.speedReadFile(activeFile);
                } else {
                    new Notice('No active file to read');
                }
            }
        });

        // Add context menu item for supported files
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile && this.isSupportedFile(file)) {
                    menu.addItem((item) => {
                        item
                            .setTitle('Speed Read')
                            .setIcon('zap')
                            .onClick(async () => {
                                await this.speedReadFile(file);
                            });
                    });
                }
            })
        );

        // Add settings tab
        this.addSettingTab(new SpeedReaderSettingTab(this.app, this));

        console.log('Speed Reader plugin loaded');
    }

    async speedReadFile(file: TFile) {
        try {
            let text = '';
            const extension = file.extension.toLowerCase();

            switch (extension) {
                case 'md':
                case 'txt':
                    text = await this.app.vault.read(file);
                    break;
                case 'pdf':
                    text = await this.extractTextFromPDF(file);
                    break;
                case 'docx':
                    text = await this.extractTextFromDOCX(file);
                    break;
                default:
                    new Notice(`Unsupported file type: ${extension}`);
                    return;
            }

            if (text.trim()) {
                const modal = new SpeedReaderModal(this.app, this.settings);
                modal.setText(text);
                modal.open();
            } else {
                new Notice('No text found in file');
            }
        } catch (error) {
            console.error('Error reading file:', error);
            new Notice(`Error reading file: ${error.message}`);
        }
    }

    async loadFileContent(file: TFile, infoElement: HTMLElement) {
        try {
            infoElement.empty();
            infoElement.createEl('div', { 
                text: `Loading: ${file.name}...`,
                cls: 'loading-text'
            });

            let text = '';
            const extension = file.extension.toLowerCase();

            switch (extension) {
                case 'md':
                case 'txt':
                    text = await this.app.vault.read(file);
                    break;
                case 'pdf':
                    text = await this.extractTextFromPDF(file);
                    break;
                case 'docx':
                    text = await this.extractTextFromDOCX(file);
                    break;
                default:
                    throw new Error(`Unsupported file type: ${extension}`);
            }

            if (text.trim()) {
                this.setText(text);
                this.updateDisplay();
                
                infoElement.empty();
                infoElement.createEl('div', { 
                    text: `✓ Loaded: ${file.name} (${this.words.length} words)`,
                    cls: 'success-text'
                });
            } else {
                throw new Error('No text found in file');
            }
        } catch (error) {
            console.error('Error loading file:', error);
            infoElement.empty();
            infoElement.createEl('div', { 
                text: `✗ Error: ${error.message}`,
                cls: 'error-text'
            });
        }
    }

    async extractTextFromPDF(file: TFile): Promise<string> {
        try {
            // Get file as ArrayBuffer
            const arrayBuffer = await this.app.vault.adapter.readBinary(file.path);
            
            // Configure PDF.js worker
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            
            // Load PDF document
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            let fullText = '';
            
            // Extract text from each page
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                try {
                    const page = await pdf.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    
                    // Combine text items with proper spacing
                    const pageText = textContent.items
                        .map((item: any) => {
                            if ('str' in item) {
                                return item.str;
                            }
                            return '';
                        })
                        .join(' ');
                    
                    fullText += pageText + '\n\n';
                } catch (pageError) {
                    console.error(`Error reading page ${pageNum}:`, pageError);
                    // Continue with other pages
                }
            }
            
            return fullText.trim();
        } catch (error) {
            console.error('PDF extraction error:', error);
            throw new Error(`Failed to extract text from PDF: ${error.message}`);
        }
    }

    async extractTextFromDOCX(file: TFile): Promise<string> {
        try {
            // Get file as ArrayBuffer
            const arrayBuffer = await this.app.vault.adapter.readBinary(file.path);
            
            // Convert ArrayBuffer to Buffer for mammoth
            const buffer = Buffer.from(arrayBuffer);
            
            // Extract text using mammoth
            const result = await mammoth.extractRawText({ buffer });
            
            if (result.messages && result.messages.length > 0) {
                console.warn('DOCX extraction warnings:', result.messages);
            }
            
            return result.value;
        } catch (error) {
            console.error('DOCX extraction error:', error);
            throw new Error(`Failed to extract text from DOCX: ${error.message}`);
        }
    }

    isSupportedFile(file: TFile): boolean {
        const supportedExtensions = ['md', 'txt', 'pdf', 'docx'];
        return supportedExtensions.includes(file.extension.toLowerCase());
    }

    onunload() {
        console.log('Speed Reader plugin unloaded');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class SpeedReaderModal extends Modal {
    private settings: SpeedReaderSettings;
    private text: string = '';
    private words: string[] = [];
    private currentIndex: number = 0;
    private isPlaying: boolean = false;
    private intervalId: number | null = null;
    private displayElement: HTMLDivElement;
    private controlsElement: HTMLDivElement;
    private progressElement: HTMLDivElement;

    constructor(app: App, settings: SpeedReaderSettings) {
        super(app);
        this.settings = settings;
    }

    setText(text: string) {
        this.text = text;
        this.words = this.preprocessText(text);
        this.currentIndex = 0;
    }

    preprocessText(text: string): string[] {
        // Clean and split text into words
        return text
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(word => word.length > 0);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('speed-reader-modal');

        // Add CSS styles
        this.addStyles();

        // Create header
        const headerEl = contentEl.createDiv('speed-reader-header');
        headerEl.createEl('h2', { text: 'Speed Reader' });

        // Create display area
        this.displayElement = contentEl.createDiv('speed-reader-display');
        this.displayElement.createEl('div', { 
            text: 'Select text or load a file to start reading',
            cls: 'placeholder-text'
        });

        // Create progress bar
        this.progressElement = contentEl.createDiv('speed-reader-progress');
        const progressBar = this.progressElement.createEl('div', { cls: 'progress-bar' });
        progressBar.createEl('div', { cls: 'progress-fill' });

        // Create controls
        this.controlsElement = contentEl.createDiv('speed-reader-controls');
        this.createControls();

        // Create file selection area
        const fileSelectionArea = contentEl.createDiv('speed-reader-file-selection');
        const fileButton = fileSelectionArea.createEl('button', {
            text: 'Select File from Vault',
            cls: 'speed-reader-btn file-select-btn'
        });

        const selectedFileInfo = fileSelectionArea.createDiv('selected-file-info');

        fileButton.addEventListener('click', () => {
            new FileSelectionModal(this.app, (file) => {
                this.loadFileContent(file, selectedFileInfo);
            }).open();
        });

        // Create text input area
        const inputArea = contentEl.createDiv('speed-reader-input');
        const textInputHeader = inputArea.createEl('h3', { text: 'Or paste text directly:' });
        const textarea = inputArea.createEl('textarea', {
            placeholder: 'Paste your text here...',
            cls: 'speed-reader-textarea'
        });

        textarea.addEventListener('input', (e) => {
            const target = e.target as HTMLTextAreaElement;
            if (target.value.trim()) {
                this.setText(target.value);
                this.updateDisplay();
            }
        });

        // Initialize display if text is already set
        if (this.words.length > 0) {
            this.updateDisplay();
        }
    }

    createControls() {
        const playBtn = this.controlsElement.createEl('button', {
            text: 'Play',
            cls: 'speed-reader-btn play-btn'
        });

        const pauseBtn = this.controlsElement.createEl('button', {
            text: 'Pause',
            cls: 'speed-reader-btn pause-btn'
        });

        const resetBtn = this.controlsElement.createEl('button', {
            text: 'Reset',
            cls: 'speed-reader-btn reset-btn'
        });

        const speedControl = this.controlsElement.createDiv('speed-control');
        speedControl.createEl('label', { text: 'Speed (WPM): ' });
        const speedInput = speedControl.createEl('input', {
            type: 'number',
            value: this.settings.wordsPerMinute.toString(),
            cls: 'speed-input'
        });

        playBtn.addEventListener('click', () => this.play());
        pauseBtn.addEventListener('click', () => this.pause());
        resetBtn.addEventListener('click', () => this.reset());
        speedInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.settings.wordsPerMinute = parseInt(target.value) || 250;
            if (this.isPlaying) {
                this.pause();
                this.play();
            }
        });
    }

    play() {
        if (this.words.length === 0) {
            new Notice('No text to read');
            return;
        }

        this.isPlaying = true;
        const interval = 60000 / this.settings.wordsPerMinute; // Convert WPM to milliseconds

        this.intervalId = window.setInterval(() => {
            if (this.currentIndex >= this.words.length) {
                this.pause();
                new Notice('Reading complete!');
                return;
            }

            this.updateDisplay();
            this.currentIndex++;
        }, interval);
    }

    pause() {
        this.isPlaying = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    reset() {
        this.pause();
        this.currentIndex = 0;
        this.updateDisplay();
    }

    updateDisplay() {
        if (this.words.length === 0) return;

        this.displayElement.empty();

        // Create word display
        const wordEl = this.displayElement.createEl('div', { cls: 'current-word' });
        
        if (this.currentIndex < this.words.length) {
            const currentWord = this.words[this.currentIndex];
            wordEl.textContent = currentWord;
            wordEl.style.color = this.settings.highlightColor;
        }

        // Update progress
        const progressFill = this.progressElement.querySelector('.progress-fill') as HTMLElement;
        if (progressFill) {
            const progress = (this.currentIndex / this.words.length) * 100;
            progressFill.style.width = `${progress}%`;
        }

        // Show position info
        const infoEl = this.displayElement.createEl('div', { cls: 'position-info' });
        infoEl.textContent = `${this.currentIndex + 1} / ${this.words.length}`;
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .speed-reader-modal {
                width: 600px;
                max-width: 90vw;
            }
            
            .speed-reader-header {
                text-align: center;
                margin-bottom: 20px;
                border-bottom: 1px solid var(--background-modifier-border);
                padding-bottom: 10px;
            }
            
            .speed-reader-display {
                height: 200px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                border: 2px solid var(--background-modifier-border);
                border-radius: 8px;
                margin-bottom: 20px;
                background: var(--background-secondary);
            }
            
            .current-word {
                font-size: 2em;
                font-weight: bold;
                margin-bottom: 10px;
            }
            
            .position-info {
                color: var(--text-muted);
                font-size: 0.9em;
            }
            
            .placeholder-text {
                color: var(--text-muted);
                font-style: italic;
            }
            
            .speed-reader-progress {
                margin-bottom: 20px;
            }
            
            .progress-bar {
                width: 100%;
                height: 8px;
                background: var(--background-modifier-border);
                border-radius: 4px;
                overflow: hidden;
            }
            
            .progress-fill {
                height: 100%;
                background: var(--interactive-accent);
                transition: width 0.3s ease;
                width: 0%;
            }
            
            .speed-reader-controls {
                display: flex;
                gap: 10px;
                align-items: center;
                justify-content: center;
                margin-bottom: 20px;
                flex-wrap: wrap;
            }
            
            .speed-reader-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                cursor: pointer;
                font-size: 14px;
            }
            
            .speed-reader-file-selection {
                margin-bottom: 20px;
                text-align: center;
            }
            
            .file-select-btn {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 16px;
                margin-bottom: 10px;
            }
            
            .file-select-btn:hover {
                background: var(--interactive-accent-hover);
            }
            
            .selected-file-info {
                min-height: 20px;
                font-size: 14px;
            }
            
            .loading-text {
                color: var(--text-muted);
                font-style: italic;
            }
            
            .success-text {
                color: var(--text-success);
                font-weight: 500;
            }
            
            .error-text {
                color: var(--text-error);
                font-weight: 500;
            }
            
            .speed-reader-input h3 {
                margin: 20px 0 10px 0;
                color: var(--text-muted);
                font-size: 14px;
                text-align: center;
            }
            
            .speed-control {
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .speed-input {
                width: 80px;
                padding: 4px 8px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background: var(--background-primary);
                color: var(--text-normal);
            }
            
            .speed-reader-textarea {
                width: 100%;
                height: 100px;
                padding: 10px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background: var(--background-primary);
                color: var(--text-normal);
                resize: vertical;
                font-family: var(--font-monospace);
            }
        `;
        document.head.appendChild(style);
    }

    onClose() {
        this.pause();
        const { contentEl } = this;
        contentEl.empty();
    }
}

class SpeedReaderSettingTab extends PluginSettingTab {
    plugin: SpeedReaderPlugin;

    constructor(app: App, plugin: SpeedReaderPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Speed Reader Settings' });

        new Setting(containerEl)
            .setName('Words per minute')
            .setDesc('Reading speed in words per minute')
            .addText(text => text
                .setPlaceholder('250')
                .setValue(this.plugin.settings.wordsPerMinute.toString())
                .onChange(async (value) => {
                    this.plugin.settings.wordsPerMinute = parseInt(value) || 250;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Highlight color')
            .setDesc('Color for highlighting the current word')
            .addText(text => text
                .setPlaceholder('#ff6b6b')
                .setValue(this.plugin.settings.highlightColor)
                .onChange(async (value) => {
                    this.plugin.settings.highlightColor = value || '#ff6b6b';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Chunk size')
            .setDesc('Number of words to display at once')
            .addText(text => text
                .setPlaceholder('1')
                .setValue(this.plugin.settings.chunkSize.toString())
                .onChange(async (value) => {
                    this.plugin.settings.chunkSize = parseInt(value) || 1;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto advance')
            .setDesc('Automatically advance to next word')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoAdvance)
                .onChange(async (value) => {
                    this.plugin.settings.autoAdvance = value;
                    await this.plugin.saveSettings();
                }));
    }
}

class FileSelectionModal extends Modal {
    private callback: (file: TFile) => void;
    private searchInput: HTMLInputElement;
    private fileList: HTMLElement;
    private allFiles: TFile[] = [];
    private filteredFiles: TFile[] = [];

    constructor(app: App, callback: (file: TFile) => void) {
        super(app);
        this.callback = callback;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('file-selection-modal');

        // Header
        const headerEl = contentEl.createDiv('file-selection-header');
        headerEl.createEl('h2', { text: 'Select File to Read' });

        // Search input
        const searchContainer = contentEl.createDiv('search-container');
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search files...',
            cls: 'file-search-input'
        });

        this.searchInput.addEventListener('input', () => {
            this.filterFiles();
        });

        // File list
        this.fileList = contentEl.createDiv('file-list');

        // Load and display files
        this.loadFiles();

        // Add styles
        this.addFileSelectionStyles();

        // Focus search input
        setTimeout(() => this.searchInput.focus(), 100);
    }

    loadFiles() {
        // Get all supported files from vault
        this.allFiles = this.app.vault.getFiles().filter(file => {
            const supportedExtensions = ['md', 'txt', 'pdf', 'docx'];
            return supportedExtensions.includes(file.extension.toLowerCase());
        });

        // Sort by name
        this.allFiles.sort((a, b) => a.name.localeCompare(b.name));
        
        this.filteredFiles = [...this.allFiles];
        this.displayFiles();
    }

    filterFiles() {
        const query = this.searchInput.value.toLowerCase();
        this.filteredFiles = this.allFiles.filter(file => 
            file.name.toLowerCase().includes(query) || 
            file.path.toLowerCase().includes(query)
        );
        this.displayFiles();
    }

    displayFiles() {
        this.fileList.empty();

        if (this.filteredFiles.length === 0) {
            this.fileList.createEl('div', {
                text: 'No supported files found',
                cls: 'no-files-message'
            });
            return;
        }

        this.filteredFiles.forEach(file => {
            const fileItem = this.fileList.createDiv('file-item');
            
            const fileIcon = fileItem.createEl('span', { cls: 'file-icon' });
            fileIcon.textContent = this.getFileIcon(file.extension);
            
            const fileName = fileItem.createEl('span', { 
                text: file.name,
                cls: 'file-name'
            });
            
            const filePath = fileItem.createEl('span', {
                text: file.path,
                cls: 'file-path'
            });

            fileItem.addEventListener('click', () => {
                this.callback(file);
                this.close();
            });

            fileItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.callback(file);
                    this.close();
                }
            });

            fileItem.tabIndex = 0;
        });
    }

    getFileIcon(extension: string): string {
        switch (extension.toLowerCase()) {
            case 'md': return '📝';
            case 'txt': return '📄';
            case 'pdf': return '📕';
            case 'docx': return '📘';
            default: return '📄';
        }
    }

    addFileSelectionStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .file-selection-modal .modal-content {
                width: 600px;
                max-width: 90vw;
                max-height: 80vh;
            }
            
            .file-selection-header {
                text-align: center;
                margin-bottom: 20px;
                padding-bottom: 10px;
                border-bottom: 1px solid var(--background-modifier-border);
            }
            
            .search-container {
                margin-bottom: 20px;
            }
            
            .file-search-input {
                width: 100%;
                padding: 12px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                background: var(--background-primary);
                color: var(--text-normal);
                font-size: 16px;
            }
            
            .file-search-input:focus {
                outline: none;
                border-color: var(--interactive-accent);
                box-shadow: 0 0 0 2px var(--interactive-accent-hover);
            }
            
            .file-list {
                max-height: 400px;
                overflow-y: auto;
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
            }
            
            .file-item {
                display: flex;
                align-items: center;
                padding: 12px;
                border-bottom: 1px solid var(--background-modifier-border);
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            .file-item:last-child {
                border-bottom: none;
            }
            
            .file-item:hover,
            .file-item:focus {
                background: var(--background-modifier-hover);
                outline: none;
            }
            
            .file-icon {
                margin-right: 12px;
                font-size: 18px;
                min-width: 24px;
                text-align: center;
            }
            
            .file-name {
                font-weight: 500;
                margin-right: 12px;
                min-width: 0;
                flex: 1;
            }
            
            .file-path {
                color: var(--text-muted);
                font-size: 12px;
                opacity: 0.7;
                text-align: right;
                max-width: 200px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .no-files-message {
                text-align: center;
                padding: 40px;
                color: var(--text-muted);
                font-style: italic;
            }
        `;
        document.head.appendChild(style);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}