import { App, Modal, TFile, Notice } from 'obsidian';
import { SpeedReaderSettings } from './main';
import { MiniPreview } from './readers/miniPreview';
import { RSVP } from './readers/RSVP';
import { LinearReader } from './readers/Linear';
import { WholeLineReader } from './readers/WholeLine'; // Import WholeLineReader
import { SplitLineReader } from './readers/SplitLine'; // Import SplitLineReader
import { ThreeSplitLineReader } from './readers/ThreeSplitLine'; // Import ThreeSplitLineReader
import { FocusReader } from './readers/Focus'; // Import FocusReader
import { Commands } from './readers/commands';
import { Progress } from './readers/progress';
import { FileButtons } from './readers/fileButtons';
import { WordSelectorModal } from './wordSelectorModal';

export class SpeedReaderModal extends Modal {
    private plugin: any; // SpeedReaderPlugin type
    private settings: SpeedReaderSettings;
    private text: string = '';
    private words: string[] = [];
    private globalCurrentIndex: number = 0; // Nova globalna pozicija
    private miniPreview: MiniPreview | null = null;
    private reader: RSVP | LinearReader | WholeLineReader | SplitLineReader | ThreeSplitLineReader | FocusReader | null = null;    private commands: Commands | null = null;
    private progress: Progress | null = null;
    private fileButtons: FileButtons | null = null;
    private wordSelectorModal: WordSelectorModal | null = null;
    private headerEl?: HTMLElement;
    private escapeHandler?: (e: KeyboardEvent) => void;
    private spaceHandler?: (e: KeyboardEvent) => void;

    constructor(app: App, plugin: any, settings: SpeedReaderSettings) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
        
        // Postavljamo property da sprečimo zatvaranje na klik van prozora
        this.shouldRestoreSelection = false;
    }

    // Prepisujemo metode koje kontrolišu zatvaranje modala
    onClickOutside(evt: MouseEvent): void {
        // Sprečavamo zatvaranje na klik van prozora
    }

    onBackdropClick(evt: MouseEvent): void {
        // Sprečavamo zatvaranje na klik van prozora
    }

    // Dozvoljavamo zatvaranje samo kroz naše kontrole
    private allowClose = false;

    close(): void {
        if (this.allowClose) {
            super.close();
        }
    }

    private forceClose(): void {
        this.allowClose = true;
        super.close();
    }

    private setupModalControls(): void {
        // Event listener za Escape taster
        const escapeHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.forceClose();
            }
        };

        document.addEventListener('keydown', escapeHandler, true);
        this.escapeHandler = escapeHandler;

        // Add keyboard shortcut for Space to play/pause
        this.spaceHandler = (e: KeyboardEvent) => {
            if (e.key === ' ') {
                const target = e.target as HTMLElement;
                // Don't trigger if in an input field
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                    return;
                }
                
                e.preventDefault();
                if (this.commands) {
                    if (this.commands.getIsPlaying()) {
                        this.commands.pause();
                    } else {
                        this.commands.play();
                    }
                }
            }
        };
        document.addEventListener('keydown', this.spaceHandler, true);

        // Čeka da se modal potpuno učita pre traženja default close dugmeta
        setTimeout(() => this.setupDefaultCloseButton(), 200);
    }

    private setupDefaultCloseButton(): void {
        const modalEl = this.contentEl.parentElement;
        if (!modalEl) return;

        // Tražimo sve moguće načine kako Obsidian kreira close dugme
        const possibleSelectors = [
            '.modal-close-button',
            '[aria-label="Close"]',
            '[title="Close"]',
            'button[class*="close"]',
            '.lucide-x',
            '.clickable-icon[aria-label="Close"]'
        ];

        let closeButton: HTMLElement | null = null;

        // Probaj sa selektorima
        for (const selector of possibleSelectors) {
            closeButton = modalEl.querySelector(selector) as HTMLElement;
            if (closeButton) break;
        }

        // Ako nije našao, prođi kroz sve dugmiće i traži one sa close simbolima
        if (!closeButton) {
            const allButtons = modalEl.querySelectorAll('button, .clickable-icon');
            for (let i = 0; i < allButtons.length; i++) {
                const buttonEl = allButtons[i] as HTMLElement;
                const text = buttonEl.textContent?.trim().toLowerCase() || '';
                const ariaLabel = buttonEl.getAttribute('aria-label')?.toLowerCase() || '';
                const title = buttonEl.getAttribute('title')?.toLowerCase() || '';
                
                if (
                    ['×', 'x', '✕'].includes(text) ||
                    ['close', 'zatvori'].includes(ariaLabel) ||
                    ['close', 'zatvori'].includes(title) ||
                    buttonEl.innerHTML.includes('lucide-x') ||
                    buttonEl.classList.contains('modal-close-button')
                ) {
                    closeButton = buttonEl;
                    break;
                }
            }
        }

        // Ako je našao close dugme, postavi handler
        if (closeButton) {
            // Ukloni postojeće event listenere
            const newButton = closeButton.cloneNode(true) as HTMLElement;
            closeButton.parentNode?.replaceChild(newButton, closeButton);
            
            // Dodaj naš handler
            newButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.forceClose();
            });

            console.log('Default close button found and configured');
        } else {
            console.log('Default close button not found, retrying...');
            // Pokušaj ponovo nakon kratke pauze
            setTimeout(() => this.setupDefaultCloseButton(), 300);
        }
    }

    private getDisplayModeString(): string {
        const { readerType } = this.settings;
        switch (readerType) {
            case 'rsvp':
                return `RSVP (${this.settings.rsvp?.displayMode || 'ellipse'})`;
            case 'linear':
                return `Linear (${this.settings.linear?.displayMode || 'normal'})`;
            case 'wholeLine':
                return `WholeLine (${this.settings.wholeLine?.displayMode || 'WholeLine'})`;
            case 'splitLine':
                return `SplitLine (${this.settings.splitLine?.displayMode || 'SplitLine'})`;
            case 'threeSplitLine':
                return `ThreeSplitLine (${this.settings.threeSplitLine?.displayMode || 'ThreeSplitLine'})`;
            case 'focus':
                return `Focus (${this.settings.focus?.displayMode || 'Margin'})`;
            default:
                return 'Unknown';
        }
    }

    private updateHeaderTitle() {
        if (this.headerEl) {
            const titleEl = this.headerEl.querySelector('h2');
            if (titleEl) {
                titleEl.textContent = `Speed Reader - ${this.getDisplayModeString()}`;
            }
        }
    }

    setText(text: string) {
        this.text = text;
        this.words = this.preprocessText(text);
        this.globalCurrentIndex = 0; // Resetuj globalnu poziciju
        
        if (this.commands) {
            this.commands.setContent(this.text, this.words);
            if (this.globalCurrentIndex !== undefined) {
                this.commands.setCurrentIndex(this.globalCurrentIndex);
            }
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
                this.globalCurrentIndex = 0; // Resetuj globalnu poziciju
                
                if (this.commands) {
                    this.commands.setContent(this.text, this.words);
                    if (this.globalCurrentIndex !== undefined) {
                        this.commands.setCurrentIndex(this.globalCurrentIndex);
                    }
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

    // Nova metoda za ažuriranje podešavanja
    public updateSettings(settings: SpeedReaderSettings) {
        this.settings = settings;
        
        // Ažuriraj sve komponente sa novim podešavanjima
        if (this.reader) {
            this.reader.updateSettings(settings);
            this.reader.applyStyles();
        }
        /* if (this.miniPreview) {
            this.miniPreview.updateSettings(settings);
        }
        if (this.commands) {
            this.commands.updateSettings(settings);
        } */
        
        // Update header title with new display mode
        this.updateHeaderTitle();
    }

    // Nova metoda za postavljanje globalne pozicije
    public setGlobalCurrentIndex(globalIndex: number) {
        this.globalCurrentIndex = Math.max(0, Math.min(globalIndex, this.words.length - 1));
        
        if (this.commands) {
            this.commands.setCurrentIndex(this.globalCurrentIndex);
        }
        
        // Ažuriraj progress bar
        if (this.progress) {
            this.progress.update(this.globalCurrentIndex, this.words.length);
        }
        
        // Ažuriraj word selector modal ako je otvoren
        if (this.wordSelectorModal) {
            this.wordSelectorModal.updateCurrentIndex(this.globalCurrentIndex);
        }
        
        // Forsiraj ažuriranje u Linear reader-u
        if (this.reader) {
            this.reader.update(this.text, this.words, this.globalCurrentIndex);
        }
    }

    // Nova metoda za dobijanje globalne pozicije
    public getGlobalCurrentIndex(): number {
        return this.globalCurrentIndex;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('speed-reader-modal');

        // Set up contentEl as flex container
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';
        contentEl.style.height = '100%';
        contentEl.style.width = '100%'; // Ensure full width

        this.restoreWindowState();

        // Postavljamo event listenere za Escape i default close dugme
        this.setupModalControls();

        // Create header at the very top - full width
        this.headerEl = contentEl.createDiv('speed-reader-header');
        this.headerEl.style.width = '100%';
        this.headerEl.style.minWidth = '100%'; // Ensure minimum width
        this.headerEl.style.maxWidth = '100%'; // Prevent overflow
        this.headerEl.style.flexShrink = '0';
        this.headerEl.style.flexGrow = '0'; // Don't grow
        this.headerEl.style.boxSizing = 'border-box'; // Include padding in width calculation
        this.headerEl.style.borderBottom = '1px solid var(--background-modifier-border)';
        this.headerEl.style.padding = '10px'; // Use padding instead of separate bottom padding
        this.headerEl.style.marginBottom = '10px';
        this.headerEl.style.cursor = 'move';
        this.headerEl.style.overflow = 'hidden'; // Prevent content overflow
        
        const headerContent = this.headerEl.createDiv('modal-header-content');
        headerContent.style.display = 'flex';
        headerContent.style.justifyContent = 'space-between';
        headerContent.style.alignItems = 'center';
        headerContent.style.width = '100%';
        headerContent.style.boxSizing = 'border-box';
        headerContent.style.minWidth = '0'; // Allow shrinking

        const title = headerContent.createEl('h2', { text: `Speed Reader - ${this.getDisplayModeString()}` });
        title.style.margin = '0';
        title.style.fontSize = '18px';
        title.style.fontWeight = '600';
        title.style.flexShrink = '0'; // Don't shrink the title
        title.style.whiteSpace = 'nowrap'; // Keep title on one line

        // Make header draggable
        this.headerEl.addClass('modal-draggable');
        this.makeDraggable(this.headerEl);

        // Container for main content below header
        const mainContainer = contentEl.createDiv('speed-reader-main-container');
        mainContainer.style.display = 'flex';
        mainContainer.style.flex = '1';
        mainContainer.style.minHeight = '0';
        mainContainer.style.width = '100%';
        mainContainer.style.boxSizing = 'border-box';

        // Create the main left section (text and commands)
        const leftSection = mainContainer.createDiv('speed-reader-left-section');
        leftSection.style.flex = '1';
        leftSection.style.display = 'flex';
        leftSection.style.flexDirection = 'column';
        leftSection.style.minWidth = '0';

        // Create reader container at the top
        const readerContainer = leftSection.createDiv('speed-reader-container');
        readerContainer.style.flex = '1';
        readerContainer.style.minHeight = '0';
        readerContainer.style.display = 'flex';
        readerContainer.style.flexDirection = 'column';
        readerContainer.style.overflow = 'hidden';

        // Create reader based on selection
        const readerType = this.settings.readerType || 'rsvp';
        
        if (readerType === 'linear') {
            this.reader = new LinearReader(readerContainer, this.settings, () => {});
        } else if (readerType === 'wholeLine') {
            this.reader = new WholeLineReader(readerContainer, this.settings, () => {});
        } else if (readerType === 'splitLine') {
            this.reader = new SplitLineReader(readerContainer, this.settings, () => {});
        } else if (readerType === 'threeSplitLine') {
            this.reader = new ThreeSplitLineReader(readerContainer, this.settings, () => {});
        } else if (readerType === 'focus') {
            this.reader = new FocusReader(readerContainer, this.settings, () => {}); // Added Focus option
        } else {
            this.reader = new RSVP(readerContainer, this.settings, () => {});
        }

        // Create commands section below reader
        const commandsSection = leftSection.createDiv('speed-reader-commands-section');
        commandsSection.style.flexShrink = '0';
        commandsSection.style.marginTop = '10px';
        
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
                this.globalCurrentIndex = 0;
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
                    // Ažuriraj globalnu poziciju
                    this.globalCurrentIndex = currentIndex;
                    
                    if (this.reader) {
                        this.reader.update(text, words, currentIndex);
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

        // Create mini preview section (on the right)
        const miniPreviewElement = mainContainer.createDiv('speed-reader-mini-preview');
        miniPreviewElement.style.width = '300px';
        miniPreviewElement.style.flexShrink = '0';
        miniPreviewElement.style.borderLeft = '1px solid var(--background-modifier-border)';
        miniPreviewElement.style.paddingLeft = '10px';
         /*this.miniPreview = new MiniPreview(
            miniPreviewElement,
            this.text,
            this.words,
            0,
            this.settings
        ); */

        this.addResizeHandles();

        const modalContainer = this.contentEl.parentElement as HTMLElement;
        const resizeObserver = new ResizeObserver(() => {
            // Update header width when modal is resized
            this.updateHeaderWidth();
            
            clearTimeout((this as any).saveTimeout);
            (this as any).saveTimeout = setTimeout(() => {
                this.saveWindowState();
            }, 500);
        });
        resizeObserver.observe(modalContainer);

        (this as any).resizeObserver = resizeObserver;

        if (this.words.length > 0) {
            // Update displays
            if (this.commands) {
                this.commands.setContent(this.text, this.words);
                if (this.globalCurrentIndex !== undefined) {
                    this.commands.setCurrentIndex(this.globalCurrentIndex);
                }
            }
        }
    }

    // Add this new method to handle header resizing
    private updateHeaderWidth() {
        if (this.headerEl) {
            // Force recalculation of header width
            this.headerEl.style.width = '100%';
            this.headerEl.offsetWidth; // Trigger reflow
        }
    }

    private openWordSelector() {
        if (this.words.length === 0) {
            new Notice('No text loaded');
            return;
        }

        const currentIndex = this.globalCurrentIndex;
        
        this.wordSelectorModal = new WordSelectorModal(
            this.app,
            this.text,
            this.words,
            currentIndex,
            (selectedIndex: number) => {
                this.setGlobalCurrentIndex(selectedIndex);
            },
            this.plugin,
            this.settings
        );
        
        this.wordSelectorModal.open();
    }

    private addResizeHandles() {
        const modalWrapper = this.contentEl.parentElement as HTMLElement;
        
        const rightHandle = modalWrapper.createDiv('resize-handle resize-handle-right');
        this.makeResizable(rightHandle, 'right');
        
        const bottomHandle = modalWrapper.createDiv('resize-handle resize-handle-bottom');
        this.makeResizable(bottomHandle, 'bottom');
        
        const cornerHandle = modalWrapper.createDiv('resize-handle resize-handle-corner');
        this.makeResizable(cornerHandle, 'corner');
    }

    private makeResizable(handle: HTMLElement, direction: 'right' | 'bottom' | 'corner') {
        let isResizing = false;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;
        
        const modalEl = this.contentEl.parentElement as HTMLElement;
        
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(window.getComputedStyle(modalEl).width, 10);
            startHeight = parseInt(window.getComputedStyle(modalEl).height, 10);
            
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
                modalEl.style.width = newWidth + 'px';
            }
            
            if (direction === 'bottom' || direction === 'corner') {
                const newHeight = Math.max(300, startHeight + deltaY);
                modalEl.style.height = newHeight + 'px';
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
        
        const modalEl = this.contentEl.parentElement as HTMLElement;
        
        handle.addEventListener('mousedown', (e) => {
            if ((e.target as HTMLElement).tagName === 'BUTTON' || 
                (e.target as HTMLElement).tagName === 'INPUT') {
                return;
            }
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = modalEl.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            
            modalEl.style.position = 'fixed';
            modalEl.style.left = startLeft + 'px';
            modalEl.style.top = startTop + 'px';
            modalEl.style.margin = '0';
            
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
            
            modalEl.style.left = newLeft + 'px';
            modalEl.style.top = newTop + 'px';
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
        const modalEl = this.contentEl.parentElement as HTMLElement;
        const rect = modalEl.getBoundingClientRect();
        
        this.settings.windowState = {
            left: modalEl.style.left || rect.left + 'px',
            top: modalEl.style.top || rect.top + 'px',
            width: modalEl.style.width || rect.width + 'px',
            height: modalEl.style.height || rect.height + 'px'
        };
        
        this.plugin.saveSettings().catch((err: Error) => 
            console.error('Failed to save window state:', err)
        );
    }

    private restoreWindowState() {
        const modalEl = this.contentEl.parentElement as HTMLElement;
        const state = this.settings.windowState;
        
        // Set default size if no state exists
        if (!state || state.left === 'auto' || state.top === 'auto') {
            modalEl.style.width = '800px';  // wider default width
            modalEl.style.height = '600px';
            return;
        }

        if (state.width !== 'auto') {
            modalEl.style.width = state.width;
        }
        if (state.height !== 'auto') {
            modalEl.style.height = state.height;
        }
        
        if (state.left !== 'auto' && state.top !== 'auto') {
            modalEl.style.position = 'fixed';
            modalEl.style.left = state.left;
            modalEl.style.top = state.top;
            modalEl.style.margin = '0';
            
            this.ensureModalVisible(modalEl);
        }
    }

    private ensureModalVisible(modalEl: HTMLElement) {
        const rect = modalEl.getBoundingClientRect();
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
        
        modalEl.style.left = left + 'px';
        modalEl.style.top = top + 'px';
    }

    onClose() {
        if (this.commands) {
            this.commands.pause();
        }

        if ((this as any).saveTimeout) {
            clearTimeout((this as any).saveTimeout);
        }

        // Uklanjamo event listener za Escape
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler, true);
        }
        
        // Remove Space key handler
        if (this.spaceHandler) {
            document.removeEventListener('keydown', this.spaceHandler, true);
        }

        this.saveWindowState();
        const { contentEl } = this;
        if ((this as any).resizeObserver) {
            (this as any).resizeObserver.disconnect();
        }
        contentEl.empty();
    }
}