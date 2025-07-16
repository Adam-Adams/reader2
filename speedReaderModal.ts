import { App, Modal, TFile, Notice } from 'obsidian';
import { SpeedReaderSettings } from './main';
import { MiniPreview } from './readers/miniPreview';
import { RSVP } from './readers/RSVP';
import { Commands } from './readers/commands';
import { Progress } from './readers/progress';
import { FileButtons } from './readers/fileButtons';
import { WordSelectorModal } from './wordSelectorModal';

export class SpeedReaderModal extends Modal {
    private plugin: any; // SpeedReaderPlugin type
    private settings: SpeedReaderSettings;
    private text: string = '';
    private words: string[] = [];
    private miniPreview: MiniPreview | null = null;
    private rsvp: RSVP | null = null;
    private commands: Commands | null = null;
    private progress: Progress | null = null;
    private fileButtons: FileButtons | null = null;
    private wordSelectorModal: WordSelectorModal | null = null;

    constructor(app: App, plugin: any, settings: SpeedReaderSettings) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
    }

    setText(text: string) {
        this.text = text;
        this.words = this.preprocessText(text);
        
        if (this.commands) {
            this.commands.setContent(this.text, this.words);
        }
    }

    preprocessText(text: string): string[] {
        return text
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(word => word.length > 0);
    }

    async loadFileContent(file: TFile, infoElement: HTMLElement | null) {
        if (!infoElement) return;
        try {
            infoElement.empty();
            infoElement.createEl('div', { 
                text: `Loading: ${file.name}...`,
                cls: 'loading-text'
            });

            const text = await this.plugin.fileHandler.readFile(file);

            if (text.trim()) {
                // Set text first
                this.text = text;
                this.words = this.preprocessText(text);
                
                if (this.commands) {
                    this.commands.setContent(this.text, this.words);
                }
                
                // Finally update the info text
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

        // Load CSS styles
        const cssPath = this.plugin.app.vault.adapter.getResourcePath('styles.css');
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssPath;
        document.head.appendChild(link);

        // Container for the main content
        const mainContainer = contentEl;

        // Create the main left section (text and commands)
        const leftSection = mainContainer.createDiv('speed-reader-left-section');

        // Create RSVP section
        this.rsvp = new RSVP(leftSection, this.settings);

        // Create commands section
        const commandsSection = leftSection.createDiv('speed-reader-commands-section');
        
        // Create progress bar
        this.progress = new Progress(commandsSection);

        // Create commands
        this.commands = new Commands(
            commandsSection,
            this.settings,
            this.plugin,
            () => {
                // Callback nakon što je play pokrenut
            },
            () => {
                // Callback nakon što je pauziran
            },

            () => {
                // Callback nakon što je resetovan
            },
            () => {
                if (this.commands) {
                    // Ako je play aktivan, resetuj sa novim podešavanjima
                    if (this.commands.getIsPlaying()) {
                        this.commands.reset();
                        this.commands.play();
                    }
                }
            },
            {
                onUpdate: (text: string, words: string[], currentIndex: number) => {
                    if (this.rsvp) {
                        this.rsvp.update(text, words, currentIndex);
                    }
                    if (this.miniPreview) {
                        this.miniPreview.update(text, words, currentIndex);
                    }
                    if (this.progress) {
                        this.progress.update(currentIndex, words.length);
                    }
                    if (this.wordSelectorModal) {
                        this.wordSelectorModal.updateCurrentIndex(currentIndex);
                    }
                }
            }
        );

        // Create file buttons
        this.fileButtons = new FileButtons(
            commandsSection,
            this.app,
            this.plugin,
            this.settings,
            (file: TFile) => this.loadFileContent(file, this.fileButtons ? this.fileButtons.getInfoElement() : null),
            (text: string) => this.setText(text)
        ); 
        /* const wordSelectorBtn = commandsSection.createEl('button', {
            text: 'Select Word',
            cls: 'speed-reader-button'
        }); 
        wordSelectorBtn.addEventListener('click', () => this.openWordSelector());*/

        // Create mini preview section (on the right)
        const miniPreviewElement = mainContainer.createDiv('speed-reader-mini-preview');
         /*this.miniPreview = new MiniPreview(
            miniPreviewElement,
            this.text,
            this.words,
            0,
            this.settings
        ); */

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

        const headerEl = leftSection.createDiv('modal-draggable');
        this.makeDraggable(headerEl);

        if (this.words.length > 0) {
            // Update displays



        }
    }

    private openWordSelector() {
        if (this.words.length === 0) {
            new Notice('No text loaded');
            return;
        }

        const currentIndex = this.commands ? this.commands.getCurrentIndex() : 0;
        
        this.wordSelectorModal = new WordSelectorModal(
            this.app,
            this.text,
            this.words,
            currentIndex,
            (selectedIndex: number) => {
                if (this.commands) {
                    this.commands.setCurrentIndex(selectedIndex);
                }
            },
            this.plugin,
            this.settings
        );
        
        this.wordSelectorModal.open();
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
        
        // Set default size if no state exists
        if (!state || state.left === 'auto' || state.top === 'auto') {
            modalContent.style.width = '800px';  // wider default width
            modalContent.style.height = '600px';
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
        if (this.commands) {
            this.commands.pause();
        }

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
