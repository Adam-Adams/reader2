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
        
        this.displayElement = this.element.createDiv('speed-reader-display');
        this.applyStyles();
    }

    public loadText(text: string): void {
        this.text = text;
        this.words = text.split(/\s+/).filter(word => word.length > 0);
        this.currentIndex = 0;
        this.render();
    }

    public applyStyles() {
        this.displayElement.style.fontFamily = this.settings.fontFamily || 'Arial';
        this.displayElement.style.fontSize = `${this.settings.fontSize || 24}px`;
        this.displayElement.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
        this.displayElement.style.display = 'flex';
        this.displayElement.style.alignItems = 'center';
        this.displayElement.style.justifyContent = 'center';
        this.displayElement.style.textAlign = 'center';
        this.displayElement.style.padding = '20px';
        this.displayElement.style.boxSizing = 'border-box';
        this.displayElement.style.wordWrap = 'break-word';
        this.displayElement.style.overflowWrap = 'break-word';
        this.displayElement.style.hyphens = 'auto';
        this.displayElement.style.lineHeight = '1.2';
        this.displayElement.style.border = '2px solid var(--background-modifier-border)';
        this.displayElement.style.borderRadius = '8px';
        this.displayElement.style.background = 'var(--background-secondary)';
    }

    public updateSettings(settings: SpeedReaderSettings): void {
        this.settings = settings;
        if (this.virtualContainer) {
            this.virtualContainer.style.fontFamily = settings.fontFamily || 'Arial';
            this.virtualContainer.style.fontSize = `${settings.fontSize || 24}px`;
            this.virtualContainer.style.letterSpacing = `${settings.letterSpacing || 0}px`;
        }
        this.highlightCurrentWords();
    }

    public update(text: string, words: string[], currentIndex: number) {
        this.text = text;
        this.words = words;
        this.currentIndex = currentIndex;
        this.render();
    }

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
            return;
        }

        this.displayElement.empty();
        
        if (this.currentIndex < this.words.length) {
            const chunk = [];
            for (let i = 0; i < this.settings.chunkSize && (this.currentIndex + i) < this.words.length; i++) {
                chunk.push(this.words[this.currentIndex + i]);
            }
            
            const wordEl = this.displayElement.createEl('div', { cls: 'current-word' });
            wordEl.textContent = chunk.join(' ');
            wordEl.style.color = this.settings.highlightColor || '#ff6b6b';
            wordEl.style.fontFamily = this.settings.fontFamily || 'Arial';
            wordEl.style.fontSize = `${this.settings.fontSize || 24}px`;
            wordEl.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
            wordEl.style.textAlign = 'center';
            wordEl.style.margin = '0';
            wordEl.style.display = 'inline-block';
            wordEl.style.whiteSpace = 'nowrap';
            wordEl.style.width = 'auto';
        } else {
            const completeEl = this.displayElement.createEl('div', { 
                text: 'Reading complete!',
                cls: 'complete-text'
            });
            completeEl.style.color = this.settings.highlightColor || '#ff6b6b';
            completeEl.style.fontFamily = this.settings.fontFamily || 'Arial';
            completeEl.style.fontSize = `${this.settings.fontSize || 24}px`;
        }
    }

    public start(): void {
        this.isPlaying = true;
    }

    public stop(): void {
        this.isPlaying = false;
    }

    public destroy(): void {
        if (this.virtualContainer) {
            this.virtualContainer.remove();
        }
        this.wordElements = [];
        this.highlightedWords = [];
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
        
        const containerWidth = this.element.clientWidth;
        
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
        if (!this.container) return;
        
        const containerHeight = this.container.clientHeight;
        const scrollTop = this.container.scrollTop;
        
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
        if (!this.container || !this.virtualContainer) return;
        
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
        if (!this.container) return;

        if (this.virtualContainer) {
            this.virtualContainer.remove();
        }

        this.virtualContainer = document.createElement('div');
        this.virtualContainer.style.position = 'relative';
        this.virtualContainer.style.height = `${this.totalHeight}px`;
        this.virtualContainer.style.width = '100%';
        this.virtualContainer.style.overflow = 'hidden';
        
        this.container.appendChild(this.virtualContainer);
        
        let scrollTimeout: NodeJS.Timeout;
        this.container.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                this.scrollPosition = this.container.scrollTop;
                this.calculateVisibleRange();
                this.requestRender();
            }, 16);
        });
        
        this.calculateVisibleRange();
        this.requestRender();
    }

    private highlightCurrentWords() {
        this.highlightedWords.forEach(el => {
            if (el.parentElement) {
                el.style.backgroundColor = 'transparent';
                el.style.color = 'inherit';
                el.style.fontWeight = 'normal';
            }
        });
        this.highlightedWords = [];

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
        if (!this.container || this.currentIndex < 0 || this.currentIndex >= this.words.length) {
            return;
        }

        const targetLineIndex = this.lineWordMappings.findIndex(
            mapping => this.currentIndex >= mapping.start && this.currentIndex <= mapping.end
        );
        
        if (targetLineIndex !== -1) {
            const targetLine = this.lineWordMappings[targetLineIndex];
            const containerHeight = this.container.clientHeight;
            const scrollTop = this.container.scrollTop;
            
            const isVisible = targetLine.top >= scrollTop && 
                            (targetLine.top + targetLine.height) <= (scrollTop + containerHeight);
            
            if (!isVisible) {
                const targetScrollTop = targetLine.top - containerHeight / 2;
                
                const oldStartIndex = this.visibleStartIndex;
                const oldEndIndex = this.visibleEndIndex;
                
                this.element.scrollTop = Math.max(0, targetScrollTop);
                this.calculateVisibleRange();
                
                if (this.visibleStartIndex !== oldStartIndex || this.visibleEndIndex !== oldEndIndex) {
                    this.requestRender();
                }
            }
            
            setTimeout(() => {
                this.highlightCurrentWords();
            }, 50);
        }
    }
}
