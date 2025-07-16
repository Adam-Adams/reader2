import { App, Modal } from 'obsidian';
import { SpeedReaderSettings } from './main';

export interface WordSelectorModalSettings {
    windowState?: {
        left: string;
        top: string;
        width: string;
        height: string;
    };
}

export class WordSelectorModal extends Modal {
    private text: string;
    private words: string[];
    private currentIndex: number;
    private onWordSelected: (index: number) => void;
    private plugin: any;
    private settings: SpeedReaderSettings;
    private headerEl?: HTMLElement;
    private textContainer?: HTMLElement;
    private resizeObserver?: ResizeObserver;
    private saveTimeout: any;
    private wordElements: HTMLElement[] = [];
    private highlightedWords: HTMLElement[] = [];
    private totalHeight = 0; // DODAJ OVU LINIJU
    
    // Virtualizacija
    private virtualContainer?: HTMLElement;
    private visibleLines: HTMLElement[] = [];
    private lineHeight = 32; // Aproksimativna visina linije
    private visibleStartIndex = 0;
    private visibleEndIndex = 0;
    private totalLines = 0;
    private lines: string[] = [];
    private lineWordMappings: { start: number; end: number; text: string }[] = [];
    private scrollPosition = 0;
    private renderBuffer = 5; // Broj dodatnih linija za renderovanje
    
    // Optimizacije
    private intersectionObserver?: IntersectionObserver;
    private renderFrameId?: number;
    private isRendering = false;

    constructor(
        app: App, 
        text: string, 
        words: string[], 
        currentIndex: number,
        onWordSelected: (index: number) => void,
        plugin: any, 
        settings: SpeedReaderSettings
    ) {
        super(app);
        this.text = text;
        this.words = words;
        this.currentIndex = currentIndex;
        this.onWordSelected = onWordSelected;
        this.plugin = plugin;
        this.settings = settings;
        
        // Pripremi podatke za virtualizaciju
        this.prepareVirtualization();
    }

    private prepareVirtualization() {
        this.lines = this.text.split('\n');
        this.totalLines = this.lines.length;
        
        // Mapiranje reči po linijama
        let globalWordIndex = 0;
        let cumulativeHeight = 0;
        
        this.lineWordMappings = this.lines.map((line, index) => {
            const wordsInLine = line.trim().split(/\s+/).filter(word => word.length > 0);
            const start = globalWordIndex;
            const end = globalWordIndex + wordsInLine.length - 1;
            globalWordIndex += wordsInLine.length;
            
            // Izračunaj visinu linije
            const containerWidth = this.textContainer?.clientWidth || 600;
            const lineHeight = this.calculateLineHeight(line, containerWidth);
            
            const mapping = {
                start,
                end,
                text: line,
                height: lineHeight,
                top: cumulativeHeight
            };
            
            cumulativeHeight += lineHeight;
            return mapping;
        });
        
        // Ažuriraj ukupnu visinu
        this.totalHeight = cumulativeHeight;
    }
    private updateElementSizes() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        if (!modalContent) return;

        const modalRect = modalContent.getBoundingClientRect();
        const contentWidth = modalRect.width;
        const contentHeight = modalRect.height;
        
        const CONTENT_PADDING = 40;
        const ELEMENT_MARGIN = 10;
        const HEADER_HEIGHT = 60;
        
        if (this.headerEl) {
            this.headerEl.style.width = `${contentWidth - (CONTENT_PADDING * 2)}px`;
            this.headerEl.style.height = `${HEADER_HEIGHT}px`;
            this.headerEl.style.marginBottom = `${ELEMENT_MARGIN}px`;
            this.headerEl.style.padding = `${ELEMENT_MARGIN}px`;
            this.headerEl.style.boxSizing = 'border-box';
        }

        if (this.textContainer) {
            const availableHeight = contentHeight - HEADER_HEIGHT - (CONTENT_PADDING * 2) - (ELEMENT_MARGIN * 2);
            this.textContainer.style.width = `${contentWidth - (CONTENT_PADDING * 2)}px`;
            this.textContainer.style.height = `${Math.max(200, availableHeight)}px`;
            this.textContainer.style.padding = `${ELEMENT_MARGIN}px`;
            this.textContainer.style.boxSizing = 'border-box';
            this.textContainer.style.maxWidth = `${contentWidth - (CONTENT_PADDING * 2)}px`;

            // Preračunaj vidljive linije
            this.calculateVisibleRange();
            this.requestRender();
        }
    }

    private setBaseStyles() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        if (modalContent) {
            modalContent.style.position = 'fixed';
            modalContent.style.maxHeight = `${window.innerHeight * 0.95}px`;
            modalContent.style.maxWidth = `${window.innerWidth * 0.8}px`;
            modalContent.style.minWidth = '500px';
            modalContent.style.minHeight = '400px';
            modalContent.style.margin = '0';
            modalContent.style.display = 'flex';
            modalContent.style.flexDirection = 'column';
            modalContent.style.overflow = 'hidden';
        }

        this.contentEl.style.width = '100%';
        this.contentEl.style.height = '100%';
        this.contentEl.style.display = 'flex';
        this.contentEl.style.flexDirection = 'column';
        this.contentEl.style.padding = '20px';
        this.contentEl.style.boxSizing = 'border-box';
        this.contentEl.style.overflow = 'hidden';
    }

    private calculateVisibleRange() {
        if (!this.textContainer) return;
        
        const containerHeight = this.textContainer.clientHeight;
        const scrollTop = this.textContainer.scrollTop;
        
        // Pronađi početnu i završnu liniju na osnovu kumulativnih visina
        let startIndex = 0;
        let endIndex = this.totalLines - 1;
        
        for (let i = 0; i < this.lineWordMappings.length; i++) {
            const mapping = this.lineWordMappings[i];
            if (mapping.top + mapping.height > scrollTop && startIndex === 0) {
                startIndex = i;
            }
            if (mapping.top > scrollTop + containerHeight) {
                endIndex = i - 1;
                break;
            }
        }
        
        // Dodaj buffer
        this.visibleStartIndex = Math.max(0, startIndex - this.renderBuffer);
        this.visibleEndIndex = Math.min(this.totalLines - 1, endIndex + this.renderBuffer);
    }

    private requestRender() {
        if (this.isRendering) return;
        
        this.isRendering = true;
        this.renderFrameId = requestAnimationFrame(() => {
            this.renderVisibleLines();
            this.isRendering = false;
        });
    }

    private renderVisibleLines() {
        if (!this.textContainer || !this.virtualContainer) return;
        
        // Očisti postojeće vidljive linije
        this.visibleLines.forEach(line => line.remove());
        this.visibleLines = [];
        
        // Renderuj vidljive linije
        for (let i = this.visibleStartIndex; i <= this.visibleEndIndex; i++) {
            const lineDiv = this.createLineElement(i);
            this.virtualContainer.appendChild(lineDiv);
            this.visibleLines.push(lineDiv);
        }
        
        // Ažuriraj highlight
        this.highlightCurrentWords();
    }

    private createLineElement(lineIndex: number): HTMLElement {
        const lineMapping = this.lineWordMappings[lineIndex];
        const lineDiv = document.createElement('div');
        lineDiv.className = 'word-selector-line';
        lineDiv.style.position = 'absolute';
        //lineDiv.style.top = `${lineIndex * this.lineHeight}px`;
        lineDiv.style.top = `${lineMapping.top}px`; // koristi dinamičku poziciju
        lineDiv.style.left = '0';
        lineDiv.style.right = '0';
        //lineDiv.style.height = `${this.lineHeight}px`;
        lineDiv.style.minHeight = `${lineMapping.height}px`; // koristi dinamičku visinu
        lineDiv.style.display = 'block'; // PROMENI sa 'flex' na 'block'
        lineDiv.style.alignItems = 'center';
        lineDiv.style.paddingLeft = '8px';
        lineDiv.style.paddingRight = '8px';
        lineDiv.style.lineHeight = '1.4';
        lineDiv.style.boxSizing = 'border-box';
        
        // DODAJ OVE LINIJE ZA PRELAMANJE TEKSTA:
        lineDiv.style.wordWrap = 'break-word';
        lineDiv.style.overflowWrap = 'break-word';
        lineDiv.style.wordBreak = 'break-word';
        lineDiv.style.overflow = 'visible'; // PROMENI sa 'hidden' na 'visible'
        lineDiv.style.textOverflow = 'ellipsis';
        // lineDiv.style.textOverflow = 'ellipsis'; // UKLONI OVU LINIJU
        // lineDiv.style.whiteSpace = 'nowrap'; // UKLONI OVU LINIJU
        lineDiv.style.whiteSpace = 'normal'; // DODAJ OVU LINIJU

        // Parsiraj reči u liniji
        const line = lineMapping.text;
        const wordsInLine = line.trim().split(/(\s+)/).filter(part => part.length > 0);
        let wordIndexInLine = 0;
        
        wordsInLine.forEach(part => {
            if (/^\s+$/.test(part)) {
                // Whitespace
                const spaceSpan = document.createElement('span');
                spaceSpan.textContent = ' ';
                lineDiv.appendChild(spaceSpan);
            } else if (part.trim().length > 0) {
                // Word
                const wordSpan = document.createElement('span');
                wordSpan.textContent = part;
                wordSpan.className = 'word-selector-word';
                
                // Stilizuj reč
                wordSpan.style.cursor = 'pointer';
                wordSpan.style.padding = '1px 2px';
                wordSpan.style.margin = '0';
                wordSpan.style.borderRadius = '3px';
                wordSpan.style.transition = 'all 0.2s ease';
                wordSpan.style.display = 'inline';

                // Prelamanje reda
                wordSpan.style.maxWidth = '100%';
                wordSpan.style.wordWrap = 'break-word';
                wordSpan.style.overflowWrap = 'break-word';
                wordSpan.style.wordBreak = 'break-word';
                
                // Izračunaj globalni indeks reči
                const wordIndex = lineMapping.start + wordIndexInLine;
                if (wordIndex < this.words.length) {
                    this.wordElements[wordIndex] = wordSpan;
                    
                    // Dodaj event listenere
                    wordSpan.addEventListener('mouseenter', () => {
                        if (!this.highlightedWords.includes(wordSpan)) {
                            wordSpan.style.backgroundColor = 'var(--interactive-hover)';
                        }
                    });
                    
                    wordSpan.addEventListener('mouseleave', () => {
                        if (!this.highlightedWords.includes(wordSpan)) {
                            wordSpan.style.backgroundColor = 'transparent';
                        }
                    });
                    
                    wordSpan.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.onWordSelected(wordIndex);
                        this.close();
                    });
                }
                
                lineDiv.appendChild(wordSpan);
                wordIndexInLine++;
            }
        });
        
        return lineDiv;
    }

    // Dodaj ovu metodu u klasu:
    private calculateLineHeight(text: string, containerWidth: number): number {
        // Kreiraj privremeni element za merenje
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.visibility = 'hidden';
        tempDiv.style.width = `${containerWidth - 16}px`; // minus padding
        tempDiv.style.fontSize = '14px';
        tempDiv.style.lineHeight = '1.4';
        tempDiv.style.wordWrap = 'break-word';
        tempDiv.style.overflowWrap = 'break-word';
        tempDiv.style.whiteSpace = 'normal';
        tempDiv.textContent = text;
        
        document.body.appendChild(tempDiv);
        const height = tempDiv.offsetHeight;
        document.body.removeChild(tempDiv);
        
        return Math.max(32, height + 8); // minimum 32px + padding
    }

    private createVirtualContainer() {
        if (!this.textContainer) return;

        // Kreiraj wrapper za virtualizaciju
        this.virtualContainer = document.createElement('div');
        this.virtualContainer.style.position = 'relative';
        this.virtualContainer.style.height = `${this.totalHeight}px`; // koristi totalHeight umesto totalLines * lineHeight
        this.virtualContainer.style.width = '100%';

        // Prelamanje reda
        this.virtualContainer.style.overflow = 'visible'; // PROMENI sa 'hidden' na 'visible'
        //this.virtualContainer.style.wordWrap = 'break-word';
        //this.virtualContainer.style.overflowWrap = 'break-word';
        
        this.textContainer.appendChild(this.virtualContainer);
        
        // Dodaj scroll listener
        this.textContainer.addEventListener('scroll', () => {
            this.scrollPosition = this.textContainer!.scrollTop;
            this.calculateVisibleRange();
            this.requestRender();
        });
        
        // Početno renderovanje
        this.calculateVisibleRange();
        this.requestRender();
    }

    private highlightCurrentWords() {
        // Ukloni prethodne highlight-ove
        this.highlightedWords.forEach(el => {
            if (el.parentElement) {
                el.style.backgroundColor = 'transparent';
                el.style.color = 'inherit';
                el.style.fontWeight = 'normal';
            }
        });
        this.highlightedWords = [];

        // Highlight trenutne reči (chunk)
        const chunkSize = this.settings.chunkSize || 1;
        for (let i = 0; i < chunkSize && (this.currentIndex + i) < this.words.length; i++) {
            const wordIndex = this.currentIndex + i;
            const wordElement = this.wordElements[wordIndex];
            
            if (wordElement && wordElement.parentElement) {
                wordElement.style.backgroundColor = this.settings.highlightColor || '#ff6b6b';
                wordElement.style.color = 'white';
                wordElement.style.fontWeight = 'bold';
                this.highlightedWords.push(wordElement);
            }
        }
    }

    private scrollToCurrentWord() {
        if (!this.textContainer || this.currentIndex < 0 || this.currentIndex >= this.words.length) {
            return;
        }

        // Pronađi liniju koja sadrži trenutnu reč
        const targetLine = this.lineWordMappings.findIndex(
            mapping => this.currentIndex >= mapping.start && this.currentIndex <= mapping.end
        );
        
        if (targetLine !== -1) {
            const targetScrollTop = targetLine * this.lineHeight - this.textContainer.clientHeight / 2;
            
            // Osiguraj da su potrebne linije rendrovane
            const oldStartIndex = this.visibleStartIndex;
            const oldEndIndex = this.visibleEndIndex;
            
            this.textContainer.scrollTop = Math.max(0, targetScrollTop);
            this.calculateVisibleRange();
            
            // Renderuj ako je potrebno
            if (this.visibleStartIndex !== oldStartIndex || this.visibleEndIndex !== oldEndIndex) {
                this.requestRender();
            }
            
            // Čekaj da se renderovanje završi, zatim highlight
            setTimeout(() => {
                this.highlightCurrentWords();
            }, 50);
        }
    }

    // Javna metoda za ažuriranje pozicije
    public updateCurrentIndex(newIndex: number) {
        this.currentIndex = newIndex;
        this.scrollToCurrentWord();
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('word-selector-modal');

        this.setBaseStyles();
        this.restoreWindowState();

        // Kreiraj header
        this.headerEl = contentEl.createDiv('word-selector-header');
        this.headerEl.style.flexShrink = '0';
        this.headerEl.style.borderBottom = '1px solid var(--background-modifier-border)';
        this.headerEl.style.paddingBottom = '10px';
        
        const title = this.headerEl.createEl('h2', { text: 'Select Starting Word' });
        title.style.margin = '0';
        title.style.fontSize = '18px';
        title.style.fontWeight = '600';
        
        const subtitle = this.headerEl.createDiv();
        subtitle.style.fontSize = '14px';
        subtitle.style.color = 'var(--text-muted)';
        subtitle.style.marginTop = '5px';
        subtitle.textContent = `${this.words.length} words • Click on any word to start reading from there`;

        // Kreiraj text container
        this.textContainer = contentEl.createDiv('word-selector-container');
        this.textContainer.style.flexGrow = '1';
        this.textContainer.style.flexShrink = '1';
        this.textContainer.style.overflow = 'auto';
        this.textContainer.style.position = 'relative';
        this.textContainer.style.border = '1px solid var(--background-modifier-border)';
        this.textContainer.style.borderRadius = '8px';
        this.textContainer.style.backgroundColor = 'var(--background-secondary)';

        // Prelamanje reda
        this.textContainer.style.wordWrap = 'break-word';
        this.textContainer.style.overflowWrap = 'break-word';
        this.textContainer.style.overflowX = 'auto'; // VRATI sa 'hidden' na 'auto'
        this.textContainer.style.overflowY = 'auto';   // omogućava vertikalni scroll
        
        // Kreiraj virtuelni container umesto direktnog kreiranja elemenata
        this.createVirtualContainer();
        
        // Dodaj resize handle-ove
        this.addResizeHandles();

        // Početno ažuriranje veličina
        this.updateElementSizes();

        // Skroluj do trenutne reči
        this.scrollToCurrentWord();

        // Postavi ResizeObserver
        const modalContent = this.contentEl.parentElement as HTMLElement;
        this.resizeObserver = new ResizeObserver(() => {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = setTimeout(() => {
                this.updateElementSizes();
                this.saveWindowState();
            }, 100);
        });
        this.resizeObserver.observe(modalContent);

        // Dodaj window resize listener
        const handleWindowResize = () => {
            this.ensureModalWithinViewport();
            this.updateElementSizes();
        };
        window.addEventListener('resize', handleWindowResize);
        (this as any).windowResizeHandler = handleWindowResize;

        // Učini header draggable
        this.headerEl.addClass('modal-draggable');
        this.makeDraggable(this.headerEl);
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
        const minWidth = 500;
        const maxWidth = window.innerWidth * 0.8;
        const minHeight = 400;
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
            
            if (direction === 'right' || direction === 'corner') {
                const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
                modalContent.style.width = newWidth + 'px';
            }
            if (direction === 'bottom' || direction === 'corner') {
                const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
                modalContent.style.height = newHeight + 'px';
            }
            
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
        
        if (!this.settings.wordSelectorWindowState) {
            this.settings.wordSelectorWindowState = {
                left: 'auto',
                top: 'auto',
                width: '600px',
                height: '500px'
            };
        }
        
        this.settings.wordSelectorWindowState = {
            left: modalContent.style.left || rect.left + 'px',
            top: modalContent.style.top || rect.top + 'px',
            width: modalContent.style.width || rect.width + 'px',
            height: modalContent.style.height || rect.height + 'px'
        };
        
        if (this.plugin && this.plugin.saveSettings) {
            this.plugin.saveSettings().catch((err: Error) => 
                console.error('Failed to save word selector window state:', err)
            );
        }
    }

    private restoreWindowState() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        const state = this.settings.wordSelectorWindowState;
        
        if (!state || state.left === 'auto' || state.top === 'auto') {
            modalContent.style.width = '600px';
            modalContent.style.height = '500px';
            return;
        }
        
        const minWidth = 500;
        const maxWidth = window.innerWidth * 0.8;
        const minHeight = 400;
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

        const minWidth = 500;
        const maxWidth = window.innerWidth * 0.8;
        const minHeight = 400;
        const maxHeight = viewHeight * 0.95;
        width = Math.max(minWidth, Math.min(maxWidth, width));
        height = Math.max(minHeight, Math.min(maxHeight, height));
        modal.style.width = `${width}px`;
        modal.style.height = `${height}px`;

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
        if (this.renderFrameId) {
            cancelAnimationFrame(this.renderFrameId);
        }
        
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        if ((this as any).windowResizeHandler) {
            window.removeEventListener('resize', (this as any).windowResizeHandler);
        }

        this.saveWindowState();

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = undefined;
        }

        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = undefined;
        }

        this.headerEl = undefined;
        this.textContainer = undefined;
        this.virtualContainer = undefined;
        this.wordElements = [];
        this.highlightedWords = [];
        this.visibleLines = [];

        this.contentEl.empty();
    }
}