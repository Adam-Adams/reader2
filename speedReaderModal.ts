import { App, Modal, TFile, Notice } from 'obsidian';
import { SpeedReaderSettings } from './main';
import { FileHandler } from './fileHandler';
import { FileSelectionModal } from './fileSelectionModal';

export class SpeedReaderModal extends Modal {
    private plugin: any; // SpeedReaderPlugin type
    private settings: SpeedReaderSettings;
    private text: string = '';
    private words: string[] = [];
    private currentIndex: number = 0;
    private isPlaying: boolean = false;
    private intervalId: number | null = null;
    private displayElement!: HTMLDivElement;
    private controlsElement!: HTMLDivElement;
    private progressElement!: HTMLDivElement;

    constructor(app: App, plugin: any, settings: SpeedReaderSettings) {
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

            const text = await this.plugin.fileHandler.readFile(file);

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

        // Load CSS styles from external file
        const cssPath = this.plugin.app.vault.adapter.getResourcePath('styles.css');
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssPath;
        document.head.appendChild(link);

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
            new FileSelectionModal(this.app, this.plugin.fileHandler, (file) => {
                this.loadFileContent(file, selectedFileInfo);
            }).open();
        });

        const inputArea = contentEl.createDiv('speed-reader-input');
        const textInputHeader = inputArea.createEl('h3', { text: 'Or paste text directly:' });
        const textarea = inputArea.createEl('textarea', {
            placeholder: 'Paste your text here...',
            cls: 'speed-reader-textarea'
        });

        this.addResizeHandles();

        const modalContent = this.contentEl.parentElement as HTMLElement;
        const resizeObserver = new ResizeObserver(() => {
            clearTimeout((this as any).saveTimeout);
            (this as any).saveTimeout = setTimeout(() => {
                this.saveWindowState();
            }, 500);
        });
        resizeObserver.observe(modalContent);

        (this as any).resizeObserver = resizeObserver;

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

        const chunkControl = this.controlsElement.createDiv('chunk-control');
        chunkControl.createEl('label', { text: 'Words: ' });
        const chunkInput = chunkControl.createEl('input', {
            type: 'number',
            value: this.settings.chunkSize.toString(),
            cls: 'chunk-input'
        });
        chunkInput.min = '1';
        chunkInput.max = '10';

        chunkInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.settings.chunkSize = parseInt(target.value) || 1;
            this.plugin.saveSettings();
            if (this.isPlaying) {
                this.pause();
                this.play();
            }
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

        if (this.isPlaying) {
            return;
        }

        const playBtn = this.controlsElement.querySelector('.play-btn') as HTMLButtonElement;
        if (playBtn) playBtn.disabled = true;

        this.isPlaying = true;
        const interval = (60000 / this.settings.wordsPerMinute) * this.settings.chunkSize;

        this.intervalId = window.setInterval(() => {
            if (this.currentIndex >= this.words.length) {
                this.pause();
                new Notice('Reading complete!');
                return;
            }

            this.updateDisplay();
            this.currentIndex += this.settings.chunkSize;
        }, interval);
    }

    pause() {
        const playBtn = this.controlsElement.querySelector('.play-btn') as HTMLButtonElement;
        if (playBtn) playBtn.disabled = false;
        this.isPlaying = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    reset() {
        const playBtn = this.controlsElement.querySelector('.play-btn') as HTMLButtonElement;
        if (playBtn) playBtn.disabled = false;
        
        this.pause();
        this.currentIndex = 0;
        this.updateDisplay();
    }

    updateDisplay() {
        if (this.words.length === 0) return;

        this.displayElement.empty();

        const wordEl = this.displayElement.createEl('div', { cls: 'current-word' });
        
        if (this.currentIndex < this.words.length) {
            const chunk = [];
            for (let i = 0; i < this.settings.chunkSize && (this.currentIndex + i) < this.words.length; i++) {
                chunk.push(this.words[this.currentIndex + i]);
            }
            
            wordEl.textContent = chunk.join(' ');
            wordEl.style.color = this.settings.highlightColor;
        }

        const progressFill = this.progressElement.querySelector('.progress-fill') as HTMLElement;
        if (progressFill) {
            const progress = (this.currentIndex / this.words.length) * 100;
            progressFill.style.width = `${progress}%`;
        }

        const infoEl = this.displayElement.createEl('div', { cls: 'position-info' });
        infoEl.textContent = `${Math.min(this.currentIndex + this.settings.chunkSize, this.words.length)} / ${this.words.length}`;
    }

    private addResizeHandles() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        
        const rightHandle = modalContent.createDiv('resize-handle resize-handle-right');
        this.makeResizable(rightHandle, 'right');
        
        const bottomHandle = modalContent.createDiv('resize-handle resize-handle-bottom');
        this.makeResizable(bottomHandle, 'bottom');
        
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
        
        this.settings.windowState = {
            left: modalContent.style.left || rect.left + 'px',
            top: modalContent.style.top || rect.top + 'px',
            width: modalContent.style.width || rect.width + 'px',
            height: modalContent.style.height || rect.height + 'px'
        };
        
        this.plugin.saveSettings().catch((err: Error) => 
            console.error('Failed to save window state:', err)
        );
    }

    private restoreWindowState() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        const state = this.settings.windowState;
        
        if (!state || state.left === 'auto' || state.top === 'auto') {
            return;
        }

        if (state.width !== 'auto') {
            modalContent.style.width = state.width;
        }
        if (state.height !== 'auto') {
            modalContent.style.height = state.height;
        }
        
        if (state.left !== 'auto' && state.top !== 'auto') {
            modalContent.style.position = 'fixed';
            modalContent.style.left = state.left;
            modalContent.style.top = state.top;
            modalContent.style.margin = '0';
            
            this.ensureModalVisible(modalContent);
        }
    }

    private ensureModalVisible(modalContent: HTMLElement) {
        const rect = modalContent.getBoundingClientRect();
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;
        
        let left = rect.left;
        let top = rect.top;
        
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

    onClose() {
        this.pause();

        if ((this as any).saveTimeout) {
            clearTimeout((this as any).saveTimeout);
        }

        this.saveWindowState();
        const { contentEl } = this;
        if ((this as any).resizeObserver) {
            (this as any).resizeObserver.disconnect();
        }
        contentEl.empty();
    }
}