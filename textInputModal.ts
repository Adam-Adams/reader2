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
    private textarea: HTMLTextAreaElement;
    private settings: TextInputModalSettings;
    private plugin: any; // Reference to plugin for saving settings

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

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('text-input-modal');

        this.restoreWindowState();

        const headerEl = contentEl.createDiv('text-input-header');
        headerEl.createEl('h2', { text: 'Enter Text for Speed Reading' });

        const textareaContainer = contentEl.createDiv('textarea-container');
        this.textarea = textareaContainer.createEl('textarea', {
            placeholder: 'Paste or type your text here...',
            cls: 'text-input-textarea'
        });

        const buttonsContainer = contentEl.createDiv('buttons-container');
        
        const submitBtn = buttonsContainer.createEl('button', {
            text: 'Start Reading',
            cls: 'text-input-btn submit-btn'
        });

        const cancelBtn = buttonsContainer.createEl('button', {
            text: 'Cancel',
            cls: 'text-input-btn cancel-btn'
        });

        // Event listeners
        submitBtn.addEventListener('click', () => {
            const text = this.textarea.value.trim();
            if (text) {
                this.onSubmit(text);
                this.close();
            }
        });

        cancelBtn.addEventListener('click', () => {
            this.close();
        });

        // Allow Enter + Ctrl/Cmd to submit
        this.textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitBtn.click();
            }
        });

        // Add resize handles
        this.addResizeHandles();

        // Setup resize observer for automatic saving
        const modalContent = this.contentEl.parentElement as HTMLElement;
        const resizeObserver = new ResizeObserver(() => {
            clearTimeout((this as any).saveTimeout);
            (this as any).saveTimeout = setTimeout(() => {
                this.saveWindowState();
            }, 500);
        });
        resizeObserver.observe(modalContent);

        (this as any).resizeObserver = resizeObserver;

        // Make header draggable
        headerEl.addClass('modal-draggable');
        this.makeDraggable(headerEl);

        // Focus on textarea
        setTimeout(() => {
            this.textarea.focus();
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
                const newWidth = Math.max(350, startWidth + deltaX);
                modalContent.style.width = newWidth + 'px';
            }
            
            if (direction === 'bottom' || direction === 'corner') {
                const newHeight = Math.max(250, startHeight + deltaY);
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
            
            const newLeft = Math.max(0, Math.min(window.innerWidth - 350, startLeft + deltaX));
            const newTop = Math.max(0, Math.min(window.innerHeight - 250, startTop + deltaY));
            
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
        // Clear timeout if exists
        if ((this as any).saveTimeout) {
            clearTimeout((this as any).saveTimeout);
        }

        // Save window state before closing
        this.saveWindowState();

        // Cleanup resize observer
        if ((this as any).resizeObserver) {
            (this as any).resizeObserver.disconnect();
        }

        const { contentEl } = this;
        contentEl.empty();
    }
}