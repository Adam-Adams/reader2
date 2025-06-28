import { App, Plugin, PluginSettingTab, Setting, TFile, Modal, Notice, FileSystemAdapter } from 'obsidian';
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';
import EPub from 'epub2';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

interface SpeedReaderSettings {
    wordsPerMinute: number;
    highlightColor: string;
    chunkSize: number;
    autoAdvance: boolean;
    windowState: {
        left: string;
        top: string;
        width: string;
        height: string;
    };

}

const DEFAULT_SETTINGS: SpeedReaderSettings = {
    wordsPerMinute: 250,
    highlightColor: '#ff6b6b',
    chunkSize: 1,
    autoAdvance: true,
    windowState: {
        left: 'auto',
        top: 'auto', 
        width: '800px',
        height: '675px'
    }
};

export default class SpeedReaderPlugin extends Plugin {
    settings!: SpeedReaderSettings;

    async onload() {
        await this.loadSettings();

        this.addCommand({
            id: 'open-speed-reader',
            name: 'Open Speed Reader',
            callback: () => {
                new SpeedReaderModal(this.app, this, this.settings).open();
            }
        });

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
                case 'epub':
                    text = await this.extractTextFromEPUB(file);
                    break;
                default:
                    new Notice(`Unsupported file type: ${extension}`);
                    return;
            }

            if (text.trim()) {
                const modal = new SpeedReaderModal(this.app, this, this.settings);
                modal.setText(text);
                modal.open();
            } else {
                new Notice('No text found in file');
            }
        } catch (error) {
            console.error('Error reading file:', error);
            new Notice(`Error reading file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async extractTextFromPDF(file: TFile): Promise<string> {
        try {
            const arrayBuffer = await this.app.vault.adapter.readBinary(file.path);
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            let fullText = '';
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                try {
                    const page = await pdf.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    
                    const pageText = textContent.items
                        .map((item: any) => ('str' in item) ? item.str : '')
                        .join(' ');
                    
                    fullText += pageText + '\n\n';
                } catch (pageError) {
                    console.error(`Error reading page ${pageNum}:`, pageError);
                }
            }
            
            return fullText.trim();
        } catch (error) {
            console.error('PDF extraction error:', error);
            throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async extractTextFromDOCX(file: TFile): Promise<string> {
        try {
            const arrayBuffer = await this.app.vault.adapter.readBinary(file.path);
            const result = await mammoth.extractRawText({ arrayBuffer });
            
            if (result.messages?.length > 0) {
                console.warn('DOCX extraction warnings:', result.messages);
            }
            
            return result.value;
        } catch (error) {
            console.error('DOCX extraction error:', error);
            throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async extractTextFromEPUB(file: TFile): Promise<string> {
        try {
            const arrayBuffer = await this.app.vault.adapter.readBinary(file.path);
            
            return new Promise(async (resolve, reject) => {
                const tempDir = os.tmpdir();
                const tempFilePath = path.join(tempDir, `temp_${Date.now()}.epub`);
                
                try {
                    await fs.writeFile(tempFilePath, Buffer.from(arrayBuffer));
                    const epub = new EPub(tempFilePath);
                
                    epub.on('error', (error: Error) => {
                        console.error('EPUB parsing error:', error);
                        reject(new Error(`Failed to parse EPUB: ${error.message}`));
                    });

                    epub.on('end', () => {
                        const chapters = epub.flow;
                        let fullText = '';
                        let processedChapters = 0;
                        
                        if (chapters.length === 0) {
                            resolve('');
                            return;
                        }
                        
                        chapters.forEach((chapter: any, index: number) => {
                            epub.getChapter(chapter.id, (error: Error, text?: string) => {
                                if (error) {
                                    console.error(`Error reading chapter ${index}:`, error);
                                } else if (text) {
                                    const cleanText = text
                                        .replace(/<[^>]*>/g, ' ')
                                        .replace(/\s+/g, ' ')
                                        .trim();
                                    fullText += cleanText + '\n\n';
                                }
                                
                                processedChapters++;
                                if (processedChapters === chapters.length) {
                                    resolve(fullText.trim());
                                }
                            });
                        });
                    });

                    epub.parse();
                    
                    epub.on('end', async () => {
                        try {
                            await fs.unlink(tempFilePath);
                        } catch (cleanupError) {
                            console.error('Error cleaning up temp file:', cleanupError);
                        }
                    });
                } catch (error) {
                    console.error('EPUB extraction error:', error);
                    reject(new Error(`Failed to extract text from EPUB: ${error instanceof Error ? error.message : String(error)}`));
                    
                    try {
                        await fs.unlink(tempFilePath);
                    } catch (cleanupError) {
                        console.error('Error cleaning up temp file:', cleanupError);
                    }
                }
            });
        } catch (error) {
            console.error('EPUB extraction error:', error);
            throw new Error(`Failed to extract text from EPUB: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    isSupportedFile(file: TFile): boolean {
        const ext = file.extension.toLowerCase();
        console.log('Checking file support for extension:', ext); // Debug log
        return ['md', 'txt', 'pdf', 'docx', 'epub'].includes(ext);
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
    private plugin: SpeedReaderPlugin;
    private settings: SpeedReaderSettings;
    private text: string = '';
    private words: string[] = [];
    private currentIndex: number = 0;
    private isPlaying: boolean = false;
    private intervalId: number | null = null;
    private displayElement!: HTMLDivElement;
    private controlsElement!: HTMLDivElement;
    private progressElement!: HTMLDivElement;

    constructor(app: App, plugin: SpeedReaderPlugin, settings: SpeedReaderSettings) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
    }

    setText(text: string) {
        this.text = text;
        this.words = this.preprocessText(text);
        this.currentIndex = 0;
    }

    preprocessText(text: string): string[] {
        return text
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(word => word.length > 0);
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
                    text = await this.plugin.extractTextFromPDF(file);
                    break;
                case 'docx':
                    text = await this.plugin.extractTextFromDOCX(file);
                    break;
                case 'epub':
                    text = await this.plugin.extractTextFromEPUB(file);
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
                text: `✗ Error: ${error instanceof Error ? error.message : String(error)}`,
                cls: 'error-text'
            });
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('speed-reader-modal');

        this.restoreWindowState();

        this.addStyles();

        const headerEl = contentEl.createDiv('speed-reader-header');
        headerEl.createEl('h2', { text: 'Speed Reader' });

        this.displayElement = contentEl.createDiv('speed-reader-display');
        this.displayElement.createEl('div', { 
            text: 'Select text or load a file to start reading',
            cls: 'placeholder-text'
        });

        this.progressElement = contentEl.createDiv('speed-reader-progress');
        const progressBar = this.progressElement.createEl('div', { cls: 'progress-bar' });
        progressBar.createEl('div', { cls: 'progress-fill' });

        this.controlsElement = contentEl.createDiv('speed-reader-controls');
        this.createControls();

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

        const inputArea = contentEl.createDiv('speed-reader-input');
        const textInputHeader = inputArea.createEl('h3', { text: 'Or paste text directly:' });
        const textarea = inputArea.createEl('textarea', {
            placeholder: 'Paste your text here...',
            cls: 'speed-reader-textarea'
        });
        // Add resize handles
        this.addResizeHandles();

        // Save state when window is resized using browser's native resize
        const modalContent = this.contentEl.parentElement as HTMLElement;
        const resizeObserver = new ResizeObserver(() => {
            clearTimeout((this as any).saveTimeout);
            (this as any).saveTimeout = setTimeout(() => {
                this.saveWindowState();
            }, 500);
        });
        resizeObserver.observe(modalContent);

        // Store observer for cleanup
        (this as any).resizeObserver = resizeObserver;

        // Add drag functionality to header
        headerEl.addClass('modal-draggable');
        this.makeDraggable(headerEl);

        textarea.addEventListener('input', (e) => {
            const target = e.target as HTMLTextAreaElement;
            if (target.value.trim()) {
                this.setText(target.value);
                this.updateDisplay();
            }
        });

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
        const interval = 60000 / this.settings.wordsPerMinute;

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

        const wordEl = this.displayElement.createEl('div', { cls: 'current-word' });
        
        if (this.currentIndex < this.words.length) {
            const currentWord = this.words[this.currentIndex];
            wordEl.textContent = currentWord;
            wordEl.style.color = this.settings.highlightColor;
        }

        const progressFill = this.progressElement.querySelector('.progress-fill') as HTMLElement;
        if (progressFill) {
            const progress = (this.currentIndex / this.words.length) * 100;
            progressFill.style.width = `${progress}%`;
        }

        const infoEl = this.displayElement.createEl('div', { cls: 'position-info' });
        infoEl.textContent = `${this.currentIndex + 1} / ${this.words.length}`;
    }
    private addResizeHandles() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        
        // Right handle
        const rightHandle = modalContent.createDiv('resize-handle resize-handle-right');
        this.makeResizable(rightHandle, 'right');
        
        // Bottom handle
        const bottomHandle = modalContent.createDiv('resize-handle resize-handle-bottom');
        this.makeResizable(bottomHandle, 'bottom');
        
        // Corner handle
        const cornerHandle = modalContent.createDiv('resize-handle resize-handle-corner');
        this.makeResizable(cornerHandle, 'corner');
    }

    private makeResizable(handle: HTMLElement, direction: 'right' | 'bottom' | 'corner') {
        let isResizing = false;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;
        
        const modalContent = this.contentEl.parentElement as HTMLElement;
        
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(window.getComputedStyle(modalContent).width, 10);
            startHeight = parseInt(window.getComputedStyle(modalContent).height, 10);
            
            e.preventDefault();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            if (direction === 'right' || direction === 'corner') {
                const newWidth = Math.max(400, startWidth + deltaX);
                modalContent.style.width = newWidth + 'px';
            }
            
            if (direction === 'bottom' || direction === 'corner') {
                const newHeight = Math.max(300, startHeight + deltaY);
                modalContent.style.height = newHeight + 'px';
            }
        };
        
        const handleMouseUp = () => {
            if (isResizing) {
                this.saveWindowState();
            }
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

    }

    private makeDraggable(handle: HTMLElement) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        
        const modalContent = this.contentEl.parentElement as HTMLElement;
        
        handle.addEventListener('mousedown', (e) => {
            // Don't drag if clicking on buttons or inputs
            if ((e.target as HTMLElement).tagName === 'BUTTON' || 
                (e.target as HTMLElement).tagName === 'INPUT') {
                return;
            }
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = modalContent.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            
            modalContent.style.position = 'fixed';
            modalContent.style.left = startLeft + 'px';
            modalContent.style.top = startTop + 'px';
            modalContent.style.margin = '0';
            
            e.preventDefault();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            const newLeft = Math.max(0, Math.min(window.innerWidth - 400, startLeft + deltaX));
            const newTop = Math.max(0, Math.min(window.innerHeight - 300, startTop + deltaY));
            
            modalContent.style.left = newLeft + 'px';
            modalContent.style.top = newTop + 'px';
        };
        
        const handleMouseUp = () => {
            if (isDragging) {
                this.saveWindowState();
            }
            isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }

    private saveWindowState() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        const rect = modalContent.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(modalContent);
        
        this.settings.windowState = {
            left: modalContent.style.left || rect.left + 'px',
            top: modalContent.style.top || rect.top + 'px',
            width: modalContent.style.width || rect.width + 'px',
            height: modalContent.style.height || rect.height + 'px'
            //width: computedStyle.width,
            //height: computedStyle.height
        };
        
        // Dodaj await za sigurnost
        this.plugin.saveSettings().catch(err => 
            console.error('Failed to save window state:', err)
        );

    }

    private restoreWindowState() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        const state = this.settings.windowState;
        
        // Dodaj validaciju
        if (!state || state.left === 'auto' || state.top === 'auto') {
            return; // Ne pokušavaj da restituišeš ako nema validnih podataka
        }

        // Apply saved dimensions and position
        if (state.width !== 'auto') {
            modalContent.style.width = state.width;
        }
        if (state.height !== 'auto') {
            modalContent.style.height = state.height;
        }
        
        // Position the modal if saved position exists
        if (state.left !== 'auto' && state.top !== 'auto') {
            modalContent.style.position = 'fixed';
            modalContent.style.left = state.left;
            modalContent.style.top = state.top;
            modalContent.style.margin = '0';
            
            // Ensure modal is still visible on screen
            this.ensureModalVisible(modalContent);
        }
    }

    private ensureModalVisible(modalContent: HTMLElement) {
        const rect = modalContent.getBoundingClientRect();
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;
        
        let left = rect.left;
        let top = rect.top;
        
        // Adjust if modal is outside viewport
        if (left + rect.width > viewWidth) {
            left = viewWidth - rect.width - 20;
        }
        if (left < 0) {
            left = 20;
        }
        if (top + rect.height > viewHeight) {
            top = viewHeight - rect.height - 20;
        }
        if (top < 0) {
            top = 20;
        }
        
        modalContent.style.left = left + 'px';
        modalContent.style.top = top + 'px';
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .speed-reader-modal {
                width: 600px;
                max-width: 90vw;
                max-height: 90vh;
                position: relative;
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
                border: 2px solid var--background-modifier-border);
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
            
            .speed-reader-modal .modal-content {
                min-width: 400px;
                min-height: 300px;
                max-width: none;
                max-height: none;
                position: relative;
                resize: both;
                overflow: auto;
            }
            .resize-handle {
                position: absolute;
                background: var(--interactive-accent);
                opacity: 0.3;
                transition: opacity 0.2s;
            }

            .resize-handle:hover {
                opacity: 0.7;
            }

            .resize-handle-right {
                top: 0;
                right: 0;
                width: 4px;
                height: 100%;
                cursor: e-resize;
            }

            .resize-handle-bottom {
                bottom: 0;
                left: 0;
                width: 100%;
                height: 4px;
                cursor: s-resize;
            }

            .resize-handle-corner {
                bottom: 0;
                right: 0;
                width: 12px;
                height: 12px;
                cursor: se-resize;
                background: var(--interactive-accent);
                opacity: 0.5;
            }

            .modal-draggable {
                cursor: move;
            }
        `;
        document.head.appendChild(style);
    }

    onClose() {
        this.pause();

            if ((this as any).saveTimeout) {
                clearTimeout((this as any).saveTimeout);
            }

        this.saveWindowState();
        const { contentEl } = this;
        // Cleanup resize observer
        if ((this as any).resizeObserver) {
            (this as any).resizeObserver.disconnect();
        }
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
    private searchInput!: HTMLInputElement;
    private fileList!: HTMLElement;
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

        const headerEl = contentEl.createDiv('file-selection-header');
        headerEl.createEl('h2', { text: 'Select File to Read' });

        const searchContainer = contentEl.createDiv('search-container');
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search files...',
            cls: 'file-search-input'
        });

        this.searchInput.addEventListener('input', () => {
            this.filterFiles();
        });

        this.fileList = contentEl.createDiv('file-list');
        this.loadFiles();
        this.addFileSelectionStyles();
        setTimeout(() => this.searchInput.focus(), 100);
    }

    loadFiles() {
        this.allFiles = this.app.vault.getFiles().filter(file => {
            const ext = file.extension.toLowerCase();
            console.log('FileSelectionModal checking extension:', ext); // Debug log
            return ['md', 'txt', 'pdf', 'docx', 'epub'].includes(ext);
        });

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
            case 'epub': return '📚';
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
                color: var--text-normal);
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
