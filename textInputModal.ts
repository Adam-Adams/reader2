import { App, Modal } from 'obsidian';

export interface TextInputModalSettings {
    windowState?: {
        left: string;
        top: string;
        width: string;
        height: string;
    };
}

export class TextInputModal extends Modal {
    private onSubmit: (text: string) => void;
    private textarea?: HTMLTextAreaElement;
    private settings: TextInputModalSettings;
    private plugin: any; // Reference to plugin for saving settings
    private headerEl?: HTMLElement;
    private textareaContainer?: HTMLElement;
    private buttonsContainer?: HTMLElement;
    private resizeObserver?: ResizeObserver;

    constructor(app: App, onSubmit: (text: string) => void, plugin?: any, settings?: TextInputModalSettings) {
        super(app);
        this.onSubmit = onSubmit;
        this.plugin = plugin;
        this.settings = settings || {
            windowState: {
                left: 'auto',
                top: 'auto',
                width: '500px',
                height: '400px'
            }
        };
    }

    // Poboljšana metoda za ažuriranje veličina svih unutrašnjih elemenata
    private updateElementSizes() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        if (!modalContent) return;

        const modalRect = modalContent.getBoundingClientRect();
        const contentWidth = modalRect.width;
        const contentHeight = modalRect.height;
        
        // Konstante za padding i margine
        const CONTENT_PADDING = 40;
        const ELEMENT_MARGIN = 10;
        const HEADER_HEIGHT = 60;
        const BUTTONS_HEIGHT = 50;
        
        // Ažuriranje header-a
        if (this.headerEl) {
            this.headerEl.style.width = `${contentWidth - (CONTENT_PADDING * 2)}px`;
            this.headerEl.style.height = `${HEADER_HEIGHT}px`;
            this.headerEl.style.marginBottom = `${ELEMENT_MARGIN}px`;
            this.headerEl.style.padding = `${ELEMENT_MARGIN}px`;
            this.headerEl.style.boxSizing = 'border-box';
        }

        // Ažuriranje textarea container-a
        if (this.textareaContainer) {
            const availableHeight = contentHeight - HEADER_HEIGHT - BUTTONS_HEIGHT - (CONTENT_PADDING * 2) - (ELEMENT_MARGIN * 3);
            this.textareaContainer.style.width = `${contentWidth - (CONTENT_PADDING * 2)}px`;
            this.textareaContainer.style.height = `${Math.max(150, availableHeight)}px`;
            this.textareaContainer.style.marginBottom = `${ELEMENT_MARGIN}px`;
            this.textareaContainer.style.padding = `${ELEMENT_MARGIN}px`;
            this.textareaContainer.style.boxSizing = 'border-box';
        }

        // Ažuriranje textarea elementa
        if (this.textarea) {
            const containerWidth = this.textareaContainer ? 
                this.textareaContainer.getBoundingClientRect().width : 
                contentWidth - (CONTENT_PADDING * 2);
            const containerHeight = this.textareaContainer ? 
                this.textareaContainer.getBoundingClientRect().height : 
                200;
            
            this.textarea.style.width = `${containerWidth - (ELEMENT_MARGIN * 2)}px`;
            this.textarea.style.height = `${containerHeight - (ELEMENT_MARGIN * 2)}px`;
            this.textarea.style.minWidth = '200px';
            this.textarea.style.minHeight = '100px';
            this.textarea.style.maxWidth = '100%';
            this.textarea.style.maxHeight = '100%';
            this.textarea.style.boxSizing = 'border-box';
            this.textarea.style.resize = 'none'; // Onemogući resize jer modal ima svoje resize handle-ove
        }

        // Ažuriranje buttons container-a
        if (this.buttonsContainer) {
            this.buttonsContainer.style.width = `${contentWidth - (CONTENT_PADDING * 2)}px`;
            this.buttonsContainer.style.height = `${BUTTONS_HEIGHT}px`;
            this.buttonsContainer.style.padding = `${ELEMENT_MARGIN}px`;
            this.buttonsContainer.style.boxSizing = 'border-box';
            this.buttonsContainer.style.display = 'flex';
            this.buttonsContainer.style.justifyContent = 'center';
            this.buttonsContainer.style.alignItems = 'center';
            this.buttonsContainer.style.gap = '10px';
        }

        // Ažuriranje dugmića unutar buttons container-a
        const buttons = this.buttonsContainer?.querySelectorAll('button');
        if (buttons) {
            buttons.forEach(button => {
                const btn = button as HTMLElement;
                btn.style.minWidth = '100px';
                btn.style.height = '30px';
                btn.style.padding = '5px 15px';
                btn.style.boxSizing = 'border-box';
            });
        }
    }

    // Metoda za postavljanje osnovnih stilova koji se ne menjaju
    private setBaseStyles() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        if (modalContent) {
            modalContent.style.position = 'fixed';
            modalContent.style.maxHeight = `${window.innerHeight * 0.95}px`;
            modalContent.style.maxWidth = `${window.innerWidth * 0.8}px`;
            modalContent.style.minWidth = '450px';
            modalContent.style.minHeight = '300px';
            modalContent.style.margin = '0';
            modalContent.style.display = 'flex';
            modalContent.style.flexDirection = 'column';
            modalContent.style.overflow = 'hidden';
        }

        // Postavi osnovne stilove za contentEl
        this.contentEl.style.width = '100%';
        this.contentEl.style.height = '100%';
        this.contentEl.style.display = 'flex';
        this.contentEl.style.flexDirection = 'column';
        this.contentEl.style.padding = '20px';
        this.contentEl.style.boxSizing = 'border-box';
        this.contentEl.style.overflow = 'hidden';
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('text-input-modal');

        // Postavi osnovne stilove
        this.setBaseStyles();

        // Obnovi stanje prozora
        this.restoreWindowState();

        // Kreiraj header
        this.headerEl = contentEl.createDiv('text-input-header');
        this.headerEl.createEl('h2', { text: 'Enter Text for Speed Reading' });
        this.headerEl.style.flexShrink = '0'; // Ne dozvoli skupljanje header-a

        // Kreiraj textarea container
        this.textareaContainer = contentEl.createDiv('textarea-container');
        this.textareaContainer.style.flexGrow = '1'; // Dozvoli da se proširuje
        this.textareaContainer.style.flexShrink = '1'; // Dozvoli da se skuplja
        this.textareaContainer.style.overflow = 'hidden';
        this.textareaContainer.style.position = 'relative';

        this.textarea = this.textareaContainer.createEl('textarea', {
            placeholder: 'Paste or type your text here...',
            cls: 'text-input-textarea'
        });

        // Kreiraj buttons container
        this.buttonsContainer = contentEl.createDiv('buttons-container');
        this.buttonsContainer.style.flexShrink = '0'; // Ne dozvoli skupljanje dugmića
        
        const submitBtn = this.buttonsContainer.createEl('button', {
            text: 'Start Reading',
            cls: 'text-input-btn submit-btn'
        });

        const cancelBtn = this.buttonsContainer.createEl('button', {
            text: 'Cancel',
            cls: 'text-input-btn cancel-btn'
        });

        // Event listeners
        submitBtn.addEventListener('click', () => {
            if (this.textarea) {
                const text = this.textarea.value.trim();
                if (text) {
                    this.onSubmit(text);
                    this.close();
                }
            }
        });

        cancelBtn.addEventListener('click', () => {
            this.close();
        });

        // Allow Enter + Ctrl/Cmd to submit
        if (this.textarea) {
            this.textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    submitBtn.click();
                }
            });
        }

        // Dodaj resize handle-ove
        this.addResizeHandles();

        // Početno ažuriranje veličina
        this.updateElementSizes();

        // Postavi ResizeObserver za automatsko praćenje promena
        const modalContent = this.contentEl.parentElement as HTMLElement;
        this.resizeObserver = new ResizeObserver(() => {
            clearTimeout((this as any).saveTimeout);
            (this as any).saveTimeout = setTimeout(() => {
                this.updateElementSizes();
                this.saveWindowState();
            }, 100); // Smanji timeout za brži odgovor
        });
        this.resizeObserver.observe(modalContent);

        // Dodaj window resize listener za slučaj kada se promeni veličina prozora
        const handleWindowResize = () => {
            this.ensureModalWithinViewport();
            this.updateElementSizes();
        };
        window.addEventListener('resize', handleWindowResize);
        (this as any).windowResizeHandler = handleWindowResize;

        // Učini header draggable
        this.headerEl.addClass('modal-draggable');
        this.makeDraggable(this.headerEl);

        // Fokusiraj textarea
        setTimeout(() => {
            if (this.textarea) {
                this.textarea.focus();
            }
        }, 100);
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
        const minWidth = 450;
        const maxWidth = window.innerWidth * 0.8;
        const minHeight = 300;
        const maxHeight = window.innerHeight * 0.95;

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
            let newWidth = startWidth;
            let newHeight = startHeight;
            
            if (direction === 'right' || direction === 'corner') {
                newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
                modalContent.style.width = newWidth + 'px';
            }
            if (direction === 'bottom' || direction === 'corner') {
                newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
                modalContent.style.height = newHeight + 'px';
            }
            
            // Odmah ažuriraj veličine tokom resize-a
            this.updateElementSizes();
        };

        const handleMouseUp = () => {
            if (isResizing) {
                this.updateElementSizes();
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
            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;
            
            // Ograniči poziciju da modal ne izađe van ekrana
            const width = parseInt(window.getComputedStyle(modalContent).width, 10);
            const height = parseInt(window.getComputedStyle(modalContent).height, 10);
            newLeft = Math.max(20, Math.min(window.innerWidth - width - 20, newLeft));
            newTop = Math.max(20, Math.min(window.innerHeight - height - 20, newTop));
            
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
        
        // Save settings if plugin is available
        if (this.plugin && this.plugin.saveSettings) {
            this.plugin.saveSettings().catch((err: Error) => 
                console.error('Failed to save text input modal window state:', err)
            );
        }
    }

    private restoreWindowState() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        const state = this.settings.windowState;
        if (!state || state.left === 'auto' || state.top === 'auto') {
            return;
        }
        
        // Ograniči širinu/visinu na dozvoljene vrednosti
        const minWidth = 450;
        const maxWidth = window.innerWidth * 0.8;
        const minHeight = 300;
        const maxHeight = window.innerHeight * 0.95;
        
        if (state.width !== 'auto') {
            let requestedWidth = parseInt(state.width);
            requestedWidth = Math.max(minWidth, Math.min(maxWidth, requestedWidth));
            modalContent.style.width = `${requestedWidth}px`;
        }
        if (state.height !== 'auto') {
            let requestedHeight = parseInt(state.height);
            requestedHeight = Math.max(minHeight, Math.min(maxHeight, requestedHeight));
            modalContent.style.height = `${requestedHeight}px`;
        }
        if (state.left !== 'auto' && state.top !== 'auto') {
            modalContent.style.position = 'fixed';
            modalContent.style.left = state.left;
            modalContent.style.top = state.top;
            modalContent.style.margin = '0';
            this.ensureModalWithinViewport();
        }
    }

    private ensureModalWithinViewport() {
        const modal = this.contentEl.parentElement as HTMLElement;
        const rect = modal.getBoundingClientRect();
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;

        let left = rect.left;
        let top = rect.top;
        let width = rect.width;
        let height = rect.height;

        // Ograniči širinu/visinu
        const minWidth = 450;
        const maxWidth = window.innerWidth * 0.8;
        const minHeight = 300;
        const maxHeight = viewHeight * 0.95;
        width = Math.max(minWidth, Math.min(maxWidth, width));
        height = Math.max(minHeight, Math.min(maxHeight, height));
        modal.style.width = `${width}px`;
        modal.style.height = `${height}px`;

        // Ograniči poziciju
        if (left + width > viewWidth) {
            left = viewWidth - width - 20;
        }
        if (left < 20) {
            left = 20;
        }
        if (top + height > viewHeight) {
            top = viewHeight - height - 20;
        }
        if (top < 20) {
            top = 20;
        }
        modal.style.left = left + 'px';
        modal.style.top = top + 'px';
    }

    onClose() {
        // Clear timeout if exists
        if ((this as any).saveTimeout) {
            clearTimeout((this as any).saveTimeout);
        }

        // Remove window resize listener
        if ((this as any).windowResizeHandler) {
            window.removeEventListener('resize', (this as any).windowResizeHandler);
        }

        // Save window state before closing
        this.saveWindowState();

        // Cleanup resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = undefined;
        }

        // Clear references
        this.headerEl = undefined;
        this.textareaContainer = undefined;
        this.buttonsContainer = undefined;
        this.textarea = undefined;

        this.contentEl.empty();
    }
}