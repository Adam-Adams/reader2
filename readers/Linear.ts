import { SpeedReaderSettings } from '../main';

interface BaseReader {
    updateSettings(settings: SpeedReaderSettings): void;
    loadText(text: string): void;
    destroy(): void;
    applyStyles(): void;
}

export class LinearReader implements BaseReader {
    public element: HTMLElement;
    public displayElement: HTMLDivElement;
    private container: HTMLElement;
    private settings: SpeedReaderSettings;
    private text = '';
    private words: string[] = [];
    private currentIndex = 0;
    private onChunkSizeChange: (newSize: number) => void;
    private totalHeight = 0;
    private isPlaying = false;
    private wordElements: HTMLElement[] = [];
    private highlightedWords: HTMLElement[] = [];
    
    // Virtualization
    private virtualContainer?: HTMLElement;
    private visibleLines: HTMLElement[] = [];
    private lineHeight = 32;
    private visibleStartIndex = 0;
    private visibleEndIndex = 0;
    private totalLines = 0;
    private lines: string[] = [];
    private lineWordMappings: { start: number; end: number; text: string; height: number; top: number }[] = [];
    private scrollPosition = 0;
    private renderBuffer = 5;
    
    // Optimizations
    private intersectionObserver?: IntersectionObserver;
    private renderFrameId?: number;
    private isRendering = false;

    constructor(element: HTMLElement, settings: SpeedReaderSettings, onChunkSizeChange?: (newSize: number) => void) {
        this.element = element;
        this.container = element;
        this.settings = settings;
        this.onChunkSizeChange = onChunkSizeChange || (() => {});
        this.isPlaying = false;
        
        // Create text section wrapper for centering
        const textSection = this.element.createDiv('speed-reader-text-section');
        this.displayElement = textSection.createDiv('speed-reader-display');
        
        // Add placeholder
        this.displayElement.createEl('div', { 
            text: 'Select text or load a file to start reading',
            cls: 'placeholder-text'
        });
        
        this.applyStyles();
    }

    public loadText(text: string): void {
        // Kompletno resetovanje stanja
        this.text = text;
        this.words = text.split(/\s+/).filter(word => word.length > 0);
        this.currentIndex = 0;
        
        // Resetovanje svih nizova i stanja
        this.wordElements = [];
        this.highlightedWords = [];
        this.visibleLines = [];
        this.lines = [];
        this.lineWordMappings = [];
        this.totalHeight = 0;
        this.totalLines = 0;
        this.visibleStartIndex = 0;
        this.visibleEndIndex = 0;
        this.scrollPosition = 0;
        
        // Zaustavljanje svih animacija
        if (this.renderFrameId) {
            cancelAnimationFrame(this.renderFrameId);
            this.renderFrameId = undefined;
        }
        this.isRendering = false;
        
        // Uklanjanje postojećeg virtualnog kontejnera
        if (this.virtualContainer) {
            this.virtualContainer.remove();
            this.virtualContainer = undefined;
        }
        
        // Uklanjanje scroll timeout
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = undefined;
        }
        
        // Resetovanje scroll pozicije
        this.displayElement.scrollTop = 0;
        
        // Forsiraj potpuno re-renderovanje
        this.isFullRender = true;
        this.render();
    }

    public applyStyles() {
        const linearSettings = this.settings.linear || { displayMode: 'words', width: 600, height: 300, wordsCount: 1 };
        
        // Set parent text section styles for centering
        const textSection = this.displayElement.parentElement;
        if (textSection) {
            textSection.style.display = 'flex';
            textSection.style.alignItems = 'center';
            textSection.style.justifyContent = 'center';
            textSection.style.flex = '1';
            textSection.style.padding = '20px';
            textSection.style.background = 'var(--background-secondary)';
        }
        
        // Apply display element styles based on linear settings
        this.displayElement.style.fontFamily = this.settings.fontFamily || 'Arial';
        this.displayElement.style.fontSize = `${this.settings.fontSize || 24}px`;
        this.displayElement.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
        this.displayElement.style.display = 'flex';
        this.displayElement.style.flexDirection = 'column';
        this.displayElement.style.textAlign = 'left';
        this.displayElement.style.padding = '10px';
        this.displayElement.style.boxSizing = 'border-box';
        this.displayElement.style.wordWrap = 'break-word';
        this.displayElement.style.overflowWrap = 'break-word';
        this.displayElement.style.hyphens = 'auto';
        this.displayElement.style.lineHeight = '1.4';
        this.displayElement.style.border = '1px solid var(--background-modifier-border)';
        this.displayElement.style.background = 'var(--background-primary)';
        this.displayElement.style.whiteSpace = 'normal';
        this.displayElement.style.width = `${linearSettings.width || 600}px`;
        this.displayElement.style.height = `${linearSettings.height || 300}px`;
        this.displayElement.style.minHeight = `${linearSettings.height || 300}px`;
        this.displayElement.style.maxHeight = '100vh';
        this.displayElement.style.wordBreak = 'break-word';
        this.displayElement.style.overflowX = 'hidden';
        this.displayElement.style.overflowY = 'auto';
        this.displayElement.style.position = 'relative';
        this.displayElement.style.scrollBehavior = 'smooth';
        this.displayElement.style.scrollbarGutter = 'stable';
        this.displayElement.style.overscrollBehavior = 'contain';
        this.displayElement.style.borderRadius = '8px';
        
        // Ensure the display element is centered
        this.displayElement.style.margin = '0 auto';
        this.displayElement.style.flexShrink = '0';
    }

    public updateSettings(settings: SpeedReaderSettings): void {
        this.settings = settings;
        
        // Apply new styles
        this.applyStyles();
        
        if (this.virtualContainer) {
            this.virtualContainer.style.fontFamily = settings.fontFamily || 'Arial';
            this.virtualContainer.style.fontSize = `${settings.fontSize || 24}px`;
            this.virtualContainer.style.letterSpacing = `${settings.letterSpacing || 0}px`;
        }
        
        // Re-prepare virtualization with new settings
        this.prepareVirtualization();
        this.createVirtualContainer();
        this.calculateVisibleRange();
        this.requestRender();
        this.highlightCurrentWords();
    }

    public update(text: string, words: string[], currentIndex: number) {
        console.log('LinearReader update called with text:', text.substring(0, 100));
        
        // Ako se text promenio, tretirati kao potpuno novo učitavanje
        if (this.text !== text) {
            console.log('Text changed, doing full reload');
            this.loadText(text);
            return;
        }
        
        // Inače samo ažurirati trenutni indeks
        this.currentIndex = currentIndex;
        this.highlightCurrentWords();
        this.scrollToCurrentWord();
    }

    private isFullRender = false;

    private render() {
        if (this.words.length === 0) {
            this.displayElement.empty();
            const placeholderEl = this.displayElement.createEl('div', { 
                text: 'Select text or load a file to start reading',
                cls: 'placeholder-text'
            });
            placeholderEl.style.fontFamily = this.settings.fontFamily || 'Arial';
            placeholderEl.style.fontSize = `${this.settings.fontSize || 24}px`;
            placeholderEl.style.color = '#999';
            placeholderEl.style.textAlign = 'center';
            placeholderEl.style.display = 'flex';
            placeholderEl.style.alignItems = 'center';
            placeholderEl.style.justifyContent = 'center';
            placeholderEl.style.height = '100%';
            return;
        }

        // Skip full re-render if only moving between words in same text
        if (this.virtualContainer && this.virtualContainer.parentElement && !this.isFullRender) {
            this.highlightCurrentWords();
            this.scrollToCurrentWord();
            return;
        }

        this.isFullRender = false;
        
        // Kompletno očišćavanje display elementa
        this.displayElement.empty();
        
        // Uklanjanje scroll event listenera pre kreiranja novih
        this.displayElement.removeEventListener('scroll', this.scrollHandler);
        
        this.prepareVirtualization();
        this.createVirtualContainer();
        
        this.calculateVisibleRange();
        this.requestRender();
        this.scrollToCurrentWord();
    }

    // Scroll handler kao klasna metoda
    private scrollTimeout?: NodeJS.Timeout;
    
    private scrollHandler = (event: Event) => {
        if (this.isRendering) return;
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }
        this.scrollTimeout = setTimeout(() => {
            const newScroll = this.displayElement.scrollTop;
            if (Math.abs(this.scrollPosition - newScroll) > 1) {
                this.scrollPosition = newScroll;
                this.calculateVisibleRange();
                this.requestRender();
            }
        }, 16);
    };

    public start(): void {
        this.isPlaying = true;
    }

    public stop(): void {
        this.isPlaying = false;
    }

    public destroy(): void {
        if (this.renderFrameId) {
            cancelAnimationFrame(this.renderFrameId);
        }
        if (this.virtualContainer) {
            this.virtualContainer.remove();
        }
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }
        // Uklanjanje event listenera
        this.displayElement.removeEventListener('scroll', this.scrollHandler);
        
        this.wordElements = [];
        this.highlightedWords = [];
        this.visibleLines = [];
    }

    public getCurrentIndex(): number {
        return this.currentIndex;
    }

    public setCurrentIndex(index: number): void {
        this.currentIndex = index;
        this.scrollToCurrentWord();
    }

    private prepareVirtualization() {
        this.lines = this.text.split('\n');
        this.totalLines = this.lines.length;
        this.lineWordMappings = [];
        
        let globalWordIndex = 0;
        let cumulativeHeight = 0;
        
        const linearSettings = this.settings.linear || { width: 600 };
        const containerWidth = (linearSettings.width || 600) - 20; // Account for padding
        
        this.lines.forEach((line, index) => {
            const wordsInLine = line.trim().split(/\s+/).filter(word => word.length > 0);
            const start = globalWordIndex;
            const end = globalWordIndex + wordsInLine.length - 1;
            globalWordIndex += wordsInLine.length;
            
            const lineHeight = this.calculateLineHeight(line, containerWidth, this.settings);
            
            this.lineWordMappings.push({
                start,
                end,
                text: line,
                height: lineHeight,
                top: cumulativeHeight
            });
            
            cumulativeHeight += lineHeight;
        });
        
        this.totalHeight = cumulativeHeight;
    }

    private calculateVisibleRange() {
        if (!this.displayElement) return;
        
        const containerHeight = this.displayElement.clientHeight;
        const scrollTop = this.displayElement.scrollTop;
        
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
        if (!this.displayElement || !this.virtualContainer) return;
        
        this.visibleLines.forEach(line => line.remove());
        this.visibleLines = [];
        
        for (let i = this.visibleStartIndex; i <= this.visibleEndIndex; i++) {
            const lineDiv = this.createLineElement(i);
            this.virtualContainer.appendChild(lineDiv);
            this.visibleLines.push(lineDiv);
        }
        
        this.highlightCurrentWords();
    }

    private createLineElement(lineIndex: number): HTMLElement {
        const lineMapping = this.lineWordMappings[lineIndex];
        const lineDiv = document.createElement('div');
        lineDiv.className = 'linear-reader-line';
        lineDiv.style.position = 'absolute';
        lineDiv.style.top = `${lineMapping.top}px`;
        lineDiv.style.left = '0';
        lineDiv.style.right = '0';
        lineDiv.style.height = `${lineMapping.height}px`;
        lineDiv.style.minHeight = `${lineMapping.height}px`;
        lineDiv.style.display = 'block';
        lineDiv.style.padding = '4px 10px';
        lineDiv.style.marginBottom = '1px';
        lineDiv.style.lineHeight = '1.4';
        lineDiv.style.boxSizing = 'border-box';
        lineDiv.style.wordWrap = 'break-word';
        lineDiv.style.overflowWrap = 'break-word';
        lineDiv.style.whiteSpace = 'normal';
        lineDiv.style.overflow = 'hidden';
        lineDiv.style.fontFamily = this.settings.fontFamily || 'Arial';
        lineDiv.style.fontSize = `${this.settings.fontSize || 24}px`;
        lineDiv.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
        
        const line = lineMapping.text;
        const wordsInLine = line.trim().split(/(\s+)/).filter(part => part.length > 0);
        let wordIndexInLine = 0;
        
        wordsInLine.forEach(part => {
            if (/^\s+$/.test(part)) {
                const spaceSpan = document.createElement('span');
                spaceSpan.textContent = ' ';
                lineDiv.appendChild(spaceSpan);
            } else if (part.trim().length > 0) {
                const wordSpan = document.createElement('span');
                wordSpan.textContent = part;
                wordSpan.className = 'linear-reader-word';
                
                wordSpan.style.cursor = 'default';
                wordSpan.style.padding = '1px 2px';
                wordSpan.style.margin = '0';
                wordSpan.style.borderRadius = '3px';
                wordSpan.style.transition = 'all 0.2s ease';
                wordSpan.style.display = 'inline';
                wordSpan.style.maxWidth = '100%';
                wordSpan.style.wordWrap = 'break-word';
                wordSpan.style.overflowWrap = 'break-word';
                
                const wordIndex = lineMapping.start + wordIndexInLine;
                if (wordIndex < this.words.length) {
                    this.wordElements[wordIndex] = wordSpan;
                }
                
                lineDiv.appendChild(wordSpan);
                wordIndexInLine++;
            }
        });
        
        return lineDiv;
    }

    private calculateLineHeight(text: string, containerWidth: number, settings: SpeedReaderSettings): number {
        const tempDiv = document.createElement('div');
        const effectiveWidth = Math.max(200, containerWidth - 32);
        tempDiv.style.width = `${effectiveWidth}px`;
        tempDiv.style.maxWidth = `${effectiveWidth}px`;
        tempDiv.style.position = 'absolute';
        tempDiv.style.visibility = 'hidden';
        tempDiv.style.fontFamily = settings.fontFamily || 'Arial';
        tempDiv.style.fontSize = `${settings.fontSize || 24}px`;
        tempDiv.style.letterSpacing = `${settings.letterSpacing || 0}px`;
        tempDiv.style.lineHeight = '1.4';
        tempDiv.style.fontWeight = 'inherit';
        tempDiv.style.wordWrap = 'break-word';
        tempDiv.style.overflowWrap = 'break-word';
        tempDiv.style.whiteSpace = 'normal';
        tempDiv.style.padding = '4px 10px';
        tempDiv.style.boxSizing = 'border-box';
        tempDiv.textContent = text || ' ';
        
        document.body.appendChild(tempDiv);
        const height = tempDiv.offsetHeight;
        
        document.body.removeChild(tempDiv);
        
        return Math.max(24, height + 32);
    }

    private createVirtualContainer() {
        if (!this.displayElement) return;

        if (this.virtualContainer) {
            this.virtualContainer.remove();
        }

        this.virtualContainer = document.createElement('div');
        this.virtualContainer.style.position = 'absolute';
        this.virtualContainer.style.height = `${this.totalHeight}px`;
        this.virtualContainer.style.width = '100%';
        this.virtualContainer.style.overflow = 'visible';
        this.virtualContainer.style.top = '0';
        this.virtualContainer.style.left = '0';
        this.virtualContainer.style.pointerEvents = 'none';
        this.virtualContainer.style.boxSizing = 'border-box';
        this.virtualContainer.style.willChange = 'transform';
        
        this.displayElement.style.overflowY = 'auto';
        this.displayElement.style.scrollbarWidth = 'thin';
        this.displayElement.style.scrollbarColor = 'var(--scrollbar-thumb-bg) var(--scrollbar-bg)';
        this.displayElement.style.position = 'relative';
        this.displayElement.style.overflowX = 'hidden';
        
        const style = document.createElement('style');
        style.textContent = `
            .speed-reader-display {
                scrollbar-width: thin;
                scrollbar-color: var(--scrollbar-thumb-bg) var(--scrollbar-bg);
            }
            .speed-reader-display::-webkit-scrollbar {
                width: 12px;
                height: 12px;
            }
            .speed-reader-display::-webkit-scrollbar-track {
                background: var(--scrollbar-bg);
                border-radius: 6px;
            }
            .speed-reader-display::-webkit-scrollbar-thumb {
                background: var(--scrollbar-thumb-bg);
                border-radius: 6px;
                border: 2px solid var(--scrollbar-bg);
            }
            .speed-reader-display::-webkit-scrollbar-thumb:hover {
                background: var(--scrollbar-thumb-bg-hover);
            }
        `;
        if (!document.querySelector('style[data-linear-reader]')) {
            style.setAttribute('data-linear-reader', 'true');
            document.head.appendChild(style);
        }
        
        this.displayElement.appendChild(this.virtualContainer);
        
        // Dodaj event listener
        this.displayElement.addEventListener('scroll', this.scrollHandler, { passive: true });
        
        this.calculateVisibleRange();
        this.requestRender();
    }

    private highlightCurrentWords() {
        // Prvo postavi sve reči na neaktivnu boju
        this.wordElements.forEach(el => {
            if (el && el.parentElement) {
                el.style.backgroundColor = 'transparent';
                el.style.color = 'var(--text-muted)';
                el.style.fontWeight = 'inherit';
            }
        });

        // Zatim očisti prethodno označene reči
        this.highlightedWords = [];

        // Get chunk size from linear settings or use chunkSize
        const linearSettings = this.settings.linear || { wordsCount: 1 };
        const chunkSize = linearSettings.displayMode === 'words' ? 
            (linearSettings.wordsCount || 1) : 
            (this.settings.chunkSize || 1);

        for (let i = 0; i < chunkSize && (this.currentIndex + i) < this.words.length; i++) {
            const wordIndex = this.currentIndex + i;
            const wordElement = this.wordElements[wordIndex];
            
            if (wordElement && wordElement.parentElement) {
                wordElement.style.backgroundColor = 'transparent';
                wordElement.style.color = this.settings.highlightColor || '#ff6b6b'; // Aktivna boja
                wordElement.style.fontWeight = 'inherit';
                this.highlightedWords.push(wordElement);
            }
        }
    }

    private scrollToCurrentWord() {
        if (!this.displayElement || this.currentIndex < 0 || this.currentIndex >= this.words.length) {
            return;
        }

        this.highlightCurrentWords();
        
        const wordElement = this.wordElements[this.currentIndex];
        if (!wordElement) {
            return;
        }

        if (this.isRendering) {
            setTimeout(() => this.scrollToCurrentWord(), 50);
            return;
        }

        this.calculateVisibleRange();
        const wordLine = this.lineWordMappings.find(m => 
            this.currentIndex >= m.start && this.currentIndex <= m.end
        );
        
        if (!wordLine) return;

        const currentWordElement = this.wordElements[this.currentIndex];
        const wordRect = currentWordElement.getBoundingClientRect();
        const containerRect = this.displayElement.getBoundingClientRect();
        
        const wordMiddle = wordRect.top + (wordRect.height / 2) - containerRect.top;
        const viewportMiddle = this.displayElement.clientHeight / 2;
        const scrollOffset = wordMiddle - viewportMiddle;
        
        const targetScroll = this.displayElement.scrollTop + scrollOffset;
        const clampedScroll = Math.max(0, Math.min(
            this.totalHeight - this.displayElement.clientHeight, 
            targetScroll
        ));
        
        if (Math.abs(this.displayElement.scrollTop - clampedScroll) < 5) {
            return;
        }

        this.displayElement.scrollTo({
            top: clampedScroll,
            behavior: 'smooth'
        });
    }

    // Helper method to get current chunk size for external use
    public getCurrentChunkSize(): number {
        const linearSettings = this.settings.linear || { wordsCount: 1 };
        return linearSettings.displayMode === 'words' ? 
            (linearSettings.wordsCount || 1) : 
            (this.settings.chunkSize || 1);
    }
}