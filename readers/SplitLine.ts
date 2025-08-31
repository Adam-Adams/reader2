import { SpeedReaderSettings } from '../main';

interface BaseReader {
    updateSettings(settings: SpeedReaderSettings): void;
    loadText(text: string): void;
    destroy(): void;
    applyStyles(): void;
}

export class SplitLineReader implements BaseReader {
    public element: HTMLElement;
    public displayElement: HTMLDivElement;
    private container: HTMLElement;
    private settings: SpeedReaderSettings;
    private fullText = '';
    private words: string[] = [];
    private currentIndex = 0;
    private globalCurrentIndex = 0;
    private onChunkSizeChange: (newSize: number) => void;
    private totalHeight = 0;
    private isPlaying = false;
    private wordElements: (HTMLElement | null)[] = [];
    private highlightedWords: HTMLElement[] = [];
    private highlightedCharacters: HTMLElement[] = [];
    
    private virtualContainer?: HTMLElement;
    private visibleLines: HTMLElement[] = [];
    private visibleStartIndex = 0;
    private visibleEndIndex = 0;
    private totalLines = 0;
    private lineWordMappings: { start: number; end: number; text: string; height: number; top: number }[] = [];
    private scrollPosition = 0;
    private renderBuffer = 5;
    
    private renderFrameId?: number;
    private isRendering = false;
    private isPreparing = false;
    private lastScrollTime = 0;
    private lastText = '';
    
    private paragraphWords = 300;
    private preparedParagraphs = 0;
    private totalParagraphs = 0;
    private paragraphs: string[] = [];
    private paragraphQueue: string[] = [];
    private isProcessingQueue = false;
    private bufferSize = 5;
    private initialBatchSize = 10;
    private lastVisibleParagraphIndex = -1;
    private activeParagraphWindow = { start: 0, end: 0 };
    private paragraphWordOffsets: number[] = [];
    private loadedParagraphs: Set<number> = new Set();

    private scrollHandler?: () => void;

    constructor(element: HTMLElement, settings: SpeedReaderSettings, onChunkSizeChange?: (newSize: number) => void) {
        this.element = element;
        this.container = element;
        this.settings = settings;
        this.onChunkSizeChange = onChunkSizeChange || (() => {});
        this.isPlaying = false;
        this.scrollHandler = undefined;
        
        this.displayElement = this.element.createDiv('speed-reader-display');
        this.applyStyles();
    }

    private resetState(): void {
        if (this.renderFrameId) {
            cancelAnimationFrame(this.renderFrameId);
            this.renderFrameId = undefined;
        }
        
        if (this.scrollHandler) {
            this.displayElement.removeEventListener('scroll', this.scrollHandler);
            this.scrollHandler = undefined;
        }
        
        if (this.virtualContainer) {
            this.virtualContainer.remove();
            this.virtualContainer = undefined;
        }
        
        this.wordElements = [];
        this.highlightedWords = [];
        this.visibleLines = [];
        this.lineWordMappings = [];
        this.paragraphs = [];
        this.paragraphQueue = [];
        this.words = [];
        
        this.currentIndex = 0;
        this.globalCurrentIndex = 0;
        this.preparedParagraphs = 0;
        this.totalHeight = 0;
        this.isProcessingQueue = false;
        this.lastVisibleParagraphIndex = -1;
        this.isRendering = false;
        this.isPreparing = false;
        this.scrollPosition = 0;
        this.paragraphWordOffsets = [];
        this.loadedParagraphs = new Set();
        this.activeParagraphWindow = { start: 0, end: 0 };
        
        this.displayElement.empty();
    }

    public loadText(text: string): void {
        this.resetState();
        
        this.fullText = text;
        this.lastText = text;

        const loadingEl = this.displayElement.createDiv({ 
            cls: 'speed-reader-loading',
            text: 'Preparing text...' 
        });
        
        this.splitTextIntoParagraphs();
        
        this.processNextBatch(() => {
            loadingEl.remove();
            this.createVirtualContainer();
            this.calculateVisibleRange();
            this.requestRender();
            this.scrollToCurrentWord();
            this.processBackgroundQueue();
        });
    }

    private splitTextIntoParagraphs() {
        const allWords = this.fullText.replace(/\s+/g, ' ').trim().split(' ').filter(word => word.length > 0);
        
        const naturalParagraphs = this.fullText.split(/\n\s*\n+/)
            .map(p => p.replace(/\n+/g, ' ').trim())
            .filter(p => p.length > 0);
        
        this.paragraphs = [];
        this.paragraphWordOffsets = [0];
        let globalWordIndex = 0;
        
        for (const para of naturalParagraphs) {
            const words = para.split(/\s+/).filter(word => word.length > 0);
            
            if (words.length <= this.paragraphWords * 1.5) {
                this.paragraphs.push(para);
                globalWordIndex += words.length;
                this.paragraphWordOffsets.push(globalWordIndex);
            } else {
                for (let i = 0; i < words.length; i += this.paragraphWords) {
                    const chunk = words.slice(i, i + this.paragraphWords).join(' ');
                    this.paragraphs.push(chunk);
                    const chunkWordCount = chunk.split(/\s+/).length;
                    globalWordIndex += chunkWordCount;
                    this.paragraphWordOffsets.push(globalWordIndex);
                }
            }
        }
        
        if (this.paragraphs.length === 0 && this.fullText.trim().length > 0) {
            const words = allWords;
            this.paragraphWordOffsets = [0];
            globalWordIndex = 0;
            
            for (let i = 0; i < words.length; i += this.paragraphWords) {
                const chunk = words.slice(i, i + this.paragraphWords).join(' ');
                this.paragraphs.push(chunk);
                const chunkWordCount = Math.min(this.paragraphWords, words.length - i);
                globalWordIndex += chunkWordCount;
                this.paragraphWordOffsets.push(globalWordIndex);
            }
        }
        
        this.totalParagraphs = this.paragraphs.length;
        this.paragraphQueue = [...this.paragraphs];
    }

    private globalToLocalIndex(globalIndex: number): { paragraphIndex: number; localIndex: number } {
        if (globalIndex < 0) return { paragraphIndex: 0, localIndex: 0 };
        
        for (let i = 0; i < this.paragraphWordOffsets.length - 1; i++) {
            if (globalIndex >= this.paragraphWordOffsets[i] && globalIndex < this.paragraphWordOffsets[i + 1]) {
                return { 
                    paragraphIndex: i, 
                    localIndex: globalIndex - this.paragraphWordOffsets[i] 
                };
            }
        }
        
        const lastParaIndex = this.paragraphs.length - 1;
        const lastParaStart = this.paragraphWordOffsets[lastParaIndex];
        return { 
            paragraphIndex: lastParaIndex, 
            localIndex: Math.max(0, globalIndex - lastParaStart) 
        };
    }

    private localToGlobalIndex(paragraphIndex: number, localIndex: number): number {
        if (paragraphIndex >= this.paragraphWordOffsets.length - 1) return 0;
        return this.paragraphWordOffsets[paragraphIndex] + localIndex;
    }

    private loadParagraphWithBuffer(targetParagraphIndex: number, callback?: () => void) {
        this.resetVirtualization();
        
        const bufferStart = Math.max(0, targetParagraphIndex - this.bufferSize);
        const bufferEnd = Math.min(this.totalParagraphs - 1, targetParagraphIndex + this.bufferSize);
        
        this.activeParagraphWindow = { start: bufferStart, end: bufferEnd };
        this.preparedParagraphs = bufferStart;
        this.paragraphQueue = this.paragraphs.slice(bufferStart, bufferEnd + 1);
        this.words = [];
        this.wordElements = [];
        
        const loadingEl = this.displayElement.createDiv({ 
            cls: 'speed-reader-loading',
            text: 'Loading paragraph...' 
        });

        this.processNextBatch(() => {
            loadingEl.remove();
            this.createVirtualContainer();
            this.calculateVisibleRange();
            this.requestRender();
            
            const targetGlobalStart = this.paragraphWordOffsets[bufferStart];
            const localIndex = Math.max(0, this.globalCurrentIndex - targetGlobalStart);
            this.currentIndex = Math.min(localIndex, this.words.length - 1);
            
            this.waitForRenderingComplete(() => {
                this.scrollToCurrentWordImmediate();
                this.highlightCurrentWords();
                
                if (callback) callback();
                
                setTimeout(() => {
                    this.processBackgroundQueue();
                }, 50);
            });
        });
    }

    private waitForRenderingComplete(callback: () => void, maxAttempts: number = 10) {
        let attempts = 0;
        
        const checkRendering = () => {
            attempts++;
            
            const wordElement = this.wordElements[this.currentIndex];
            const isRendered = wordElement && wordElement.offsetParent !== null;
            
            if (isRendered || attempts >= maxAttempts) {
                callback();
            } else {
                setTimeout(checkRendering, 100);
            }
        };
        
        checkRendering();
    }

    private scrollToCurrentWordImmediate() {
        if (!this.displayElement || this.currentIndex < 0 || this.currentIndex >= this.words.length) {
            return;
        }

        let targetLineIndex = -1;
        for (let i = 0; i < this.lineWordMappings.length; i++) {
            const mapping = this.lineWordMappings[i];
            if (this.currentIndex >= mapping.start && this.currentIndex <= mapping.end) {
                targetLineIndex = i;
                break;
            }
        }
        
        if (targetLineIndex === -1) {
            return;
        }

        const targetLine = this.lineWordMappings[targetLineIndex];
        const containerHeight = this.displayElement.clientHeight;
        
        const bufferSpace = containerHeight * 0.4;
        const targetScroll = Math.max(0, targetLine.top - bufferSpace);
        
        this.scrollPosition = targetScroll;
        
        this.calculateVisibleRange();
        
        this.requestRender();
        
        setTimeout(() => {
            this.displayElement.scrollTop = targetScroll;
            
            if (Math.abs(this.displayElement.scrollTop - targetScroll) > 10) {
                let attempts = 0;
                const forceScroll = () => {
                    if (attempts >= 5) {
                        this.highlightCurrentWords();
                        return;
                    }
                    
                    this.displayElement.scrollTop = targetScroll;
                    attempts++;
                    
                    if (Math.abs(this.displayElement.scrollTop - targetScroll) > 10) {
                        setTimeout(forceScroll, 50);
                    } else {
                        this.highlightCurrentWords();
                    }
                };
                
                forceScroll();
            } else {
                this.highlightCurrentWords();
            }
        }, 100);
    }

    private checkAndAdjustCentering(attempt: number = 0, maxAttempts: number = 3) {
        if (attempt >= maxAttempts) {
            this.highlightCurrentWords();
            return;
        }
        
        const wordElement = this.wordElements[this.currentIndex];
        if (!wordElement || !wordElement.offsetParent) {
            setTimeout(() => {
                this.checkAndAdjustCentering(attempt + 1, maxAttempts);
            }, 100);
            return;
        }

        const containerRect = this.displayElement.getBoundingClientRect();
        const wordRect = wordElement.getBoundingClientRect();
        
        const containerCenter = containerRect.top + containerRect.height / 2;
        const wordCenter = wordRect.top + wordRect.height / 2;
        const offset = wordCenter - containerCenter;
        
        if (Math.abs(offset) > 100) {
            const targetScroll = Math.max(0, this.displayElement.scrollTop + offset);
            
            this.displayElement.scrollTop = targetScroll;
            this.scrollPosition = targetScroll;
            
            this.calculateVisibleRange();
            this.requestRender();
            
            setTimeout(() => {
                this.checkAndAdjustCentering(attempt + 1, maxAttempts);
            }, 150);
        } else {
            this.highlightCurrentWords();
        }
    }

    private ensureWordsCentered(maxAttempts: number = 10, attempt: number = 0) {
        if (attempt >= maxAttempts) {
            return;
        }

        setTimeout(() => {
            if (!this.areHighlightedWordsCentered()) {
                this.adjustScrollForCentering();
                this.ensureWordsCentered(maxAttempts, attempt + 1);
            } else {
                this.highlightCurrentWords();
            }
        }, 50);
    }

    private areHighlightedWordsCentered(): boolean {
        if (!this.displayElement || this.currentIndex < 0 || this.currentIndex >= this.words.length) {
            return true;
        }

        const wordElement = this.wordElements[this.currentIndex];
        if (!wordElement || !wordElement.offsetParent) {
            return false;
        }

        const containerRect = this.displayElement.getBoundingClientRect();
        const wordRect = wordElement.getBoundingClientRect();
        
        const containerCenter = containerRect.top + containerRect.height / 2;
        const wordCenter = wordRect.top + wordRect.height / 2;
        
        const tolerance = containerRect.height * 0.2;
        return Math.abs(wordCenter - containerCenter) <= tolerance;
    }

    private adjustScrollForCentering() {
        if (!this.displayElement || this.currentIndex < 0 || this.currentIndex >= this.words.length) {
            return;
        }

        const wordElement = this.wordElements[this.currentIndex];
        if (!wordElement || !wordElement.offsetParent) {
            return;
        }

        const containerRect = this.displayElement.getBoundingClientRect();
        const wordRect = wordElement.getBoundingClientRect();
        
        const containerCenter = containerRect.top + containerRect.height / 2;
        const wordCenter = wordRect.top + wordRect.height / 2;
        
        const offset = wordCenter - containerCenter;
        const currentScroll = this.displayElement.scrollTop;
        const newScroll = Math.max(0, currentScroll + offset);
        
        this.displayElement.scrollTop = newScroll;
        this.scrollPosition = newScroll;
        
        this.calculateVisibleRange();
        this.requestRender();
    }

    private resetVirtualization() {
        if (this.renderFrameId) {
            cancelAnimationFrame(this.renderFrameId);
            this.renderFrameId = undefined;
        }
        
        if (this.virtualContainer) {
            this.virtualContainer.remove();
            this.virtualContainer = undefined;
        }
        
        this.visibleLines = [];
        this.lineWordMappings = [];
        this.totalHeight = 0;
        this.totalLines = 0;
        this.isRendering = false;
        this.scrollPosition = 0;
    }

    private processNextBatch(callback?: () => void) {
        if (this.paragraphQueue.length === 0) {
            if (callback) callback();
            return;
        }
        
        const paragraphsToProcess = Math.min(this.initialBatchSize, this.paragraphQueue.length);
        let processed = 0;
        
        const processNext = () => {
            if (processed >= paragraphsToProcess || this.paragraphQueue.length === 0) {
                if (callback) callback();
                return;
            }
            
            const paragraph = this.paragraphQueue.shift()!;
            this.prepareParagraph(paragraph, this.preparedParagraphs, () => {
                this.preparedParagraphs++;
                processed++;
                processNext();
            });
        };
        
        processNext();
    }

    private processBackgroundQueue() {
        if (this.isProcessingQueue || this.paragraphQueue.length === 0) return;
        
        this.isProcessingQueue = true;
        
        const processNext = () => {
            if (this.paragraphQueue.length === 0) {
                this.isProcessingQueue = false;
                return;
            }
            
            const lastVisible = this.getLastVisibleParagraphIndex();
            const paragraphsNeeded = Math.min(
                lastVisible + this.bufferSize,
                this.totalParagraphs - 1
            );
            
            const paragraphsToPrepare = paragraphsNeeded - this.preparedParagraphs;
            
            if (paragraphsToPrepare <= 0 && this.preparedParagraphs < this.totalParagraphs) {
                const paragraph = this.paragraphQueue.shift()!;
                this.prepareParagraph(paragraph, this.preparedParagraphs, () => {
                    this.preparedParagraphs++;
                    this.isProcessingQueue = false;
                    
                    if (this.virtualContainer) {
                        this.virtualContainer.style.height = `${this.totalHeight}px`;
                    }
                    
                    this.calculateVisibleRange();
                    this.requestRender();
                });
                return;
            }
            
            if (paragraphsToPrepare <= 0) {
                this.isProcessingQueue = false;
                return;
            }
            
            const paragraph = this.paragraphQueue.shift()!;
            this.prepareParagraph(paragraph, this.preparedParagraphs, () => {
                this.preparedParagraphs++;

                if (this.preparedParagraphs <= paragraphsNeeded) {
                    requestAnimationFrame(processNext);
                } else {
                    this.isProcessingQueue = false;
                }
                
                if (this.virtualContainer) {
                    this.virtualContainer.style.height = `${this.totalHeight}px`;
                }
            });
        };
        
        requestAnimationFrame(processNext);
    }

    private getLastVisibleParagraphIndex(): number {
        if (this.lastVisibleParagraphIndex >= 0) {
            return this.lastVisibleParagraphIndex;
        }
        
        if (!this.displayElement || this.lineWordMappings.length === 0) return 0;
        
        const scrollBottom = this.displayElement.scrollTop + this.displayElement.clientHeight;
        let lastVisiblePara = this.activeParagraphWindow.start;
        
        for (let i = this.lineWordMappings.length - 1; i >= 0; i--) {
            const mapping = this.lineWordMappings[i];
            if (mapping.top <= scrollBottom) {
                const globalWordIndex = this.localToGlobalIndex(0, mapping.start) + this.paragraphWordOffsets[this.activeParagraphWindow.start];
                lastVisiblePara = this.getParagraphForGlobalWordIndex(globalWordIndex);
                break;
            }
        }
        
        this.lastVisibleParagraphIndex = lastVisiblePara;
        return lastVisiblePara;
    }

    private getParagraphForGlobalWordIndex(globalWordIndex: number): number {
        if (globalWordIndex < 0) return 0;
        
        for (let i = 0; i < this.paragraphWordOffsets.length - 1; i++) {
            if (globalWordIndex >= this.paragraphWordOffsets[i] && globalWordIndex < this.paragraphWordOffsets[i + 1]) {
                return i;
            }
        }
        return Math.max(0, this.paragraphs.length - 1);
    }

    private prepareParagraph(paragraph: string, paragraphIndex: number, callback: () => void) {
        const words = paragraph.trim().split(/\s+/).filter(word => word.length > 0);
        if (words.length === 0) {
            callback();
            return;
        }

        const measurer = this.createMeasurerElement();
        document.body.appendChild(measurer);

        const containerWidth = this.getContainerWidth();
        measurer.style.width = `${containerWidth}px`;
        measurer.innerHTML = '';
        
        const wordSpans: HTMLElement[] = [];
        words.forEach((w, i) => {
            const ws = document.createElement('span');
            ws.textContent = w;
            ws.className = 'linear-reader-word';
            Object.assign(ws.style, {
                cursor: 'default',
                padding: '1px 2px',
                margin: '0',
                borderRadius: '3px',
                transition: 'all 0.2s ease',
                display: 'inline',
                maxWidth: '100%',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                whiteSpace: w.includes('-') ? 'nowrap' : 'normal',
                wordBreak: w.includes('-') ? 'normal' : 'break-word',
                letterSpacing: `${this.settings.letterSpacing || 0}px`
            });
            measurer.appendChild(ws);
            wordSpans.push(ws);
            
            if (i < words.length - 1) {
                const sp = document.createElement('span');
                sp.textContent = ' ';
                sp.style.letterSpacing = '0px';
                measurer.appendChild(sp);
            }
        });

        const groups = this.groupWordsByPositionOptimized(wordSpans);
        
        const startWordIndex = this.words.length;
        const paragraphGap = paragraphIndex > this.activeParagraphWindow.start ? Math.max(8, (this.settings.fontSize || 24) * 0.5) : 0;
        let cumulativeHeight = this.totalHeight + paragraphGap;
        
        for (let grp of groups) {
            const textForHeight = grp.words.map(s => s.textContent || '').join(' ');
            const lineHeight = this.calculateLineHeight(
                textForHeight, 
                containerWidth, 
                this.settings
            );
            
            this.lineWordMappings.push({
                start: startWordIndex + grp.startIndex,
                end: startWordIndex + grp.endIndex,
                text: textForHeight,
                height: lineHeight,
                top: cumulativeHeight
            });
            
            cumulativeHeight += lineHeight;
        }
        
        this.words = [...this.words, ...words];
        this.totalHeight = cumulativeHeight;
        this.totalLines = this.lineWordMappings.length;

        document.body.removeChild(measurer);
        callback();
    }

    private createMeasurerElement(): HTMLElement {
        const measurer = document.createElement('div');
        measurer.style.position = 'absolute';
        measurer.style.visibility = 'hidden';
        measurer.style.left = '-9999px';
        measurer.style.top = '0';
        measurer.style.boxSizing = 'border-box';
        measurer.style.padding = '4px';
        measurer.style.fontFamily = this.settings.fontFamily || 'Arial';
        measurer.style.fontSize = `${this.settings.fontSize || 24}px`;
        measurer.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
        measurer.style.lineHeight = '1.5';
        measurer.style.wordWrap = 'break-word';
        measurer.style.overflowWrap = 'break-word';
        measurer.style.whiteSpace = 'normal';
        measurer.style.textAlign = 'justify';
        (measurer.style as any)['textJustify'] = 'inter-word';
        return measurer;
    }

    private groupWordsByPositionOptimized(wordSpans: HTMLElement[]): 
        { top: number; words: HTMLElement[]; startIndex: number; endIndex: number }[] {
        
        const groups: { top: number; words: HTMLElement[]; startIndex: number; endIndex: number }[] = [];
        const positionMap = new Map<number, { words: HTMLElement[]; indices: number[] }>();
        
        for (let i = 0; i < wordSpans.length; i++) {
            const ws = wordSpans[i];
            const top = Math.round(ws.offsetTop);
            
            if (!positionMap.has(top)) {
                positionMap.set(top, { words: [], indices: [] });
            }
            
            const group = positionMap.get(top)!;
            group.words.push(ws);
            group.indices.push(i);
        }
        
        for (const [top, group] of positionMap) {
            groups.push({
                top,
                words: group.words,
                startIndex: Math.min(...group.indices),
                endIndex: Math.max(...group.indices)
            });
        }
        
        groups.sort((a, b) => a.top - b.top);
        return groups;
    }

    private getContainerWidth(): number {
        const outerWidth = this.displayElement?.clientWidth || 600;
        const computedStyle = this.displayElement ? window.getComputedStyle(this.displayElement) : null;
        const padLeft = computedStyle ? parseFloat(computedStyle.paddingLeft || '0') : 0;
        const padRight = computedStyle ? parseFloat(computedStyle.paddingRight || '0') : 0;
        const containerWidth = Math.max(200, outerWidth - padLeft - padRight);
        
        return containerWidth;
    }

    public applyStyles() {
        const displayMode = this.settings.splitLine?.displayMode || 'SplitLine';
        const splitLetterSettings = this.settings.splitLine?.splitLetter || { chunkSize: 3 };

        if (displayMode === 'SplitLetter') {
            this.settings.chunkSize = splitLetterSettings.chunkSize;
            if (this.onChunkSizeChange) {
                this.onChunkSizeChange(splitLetterSettings.chunkSize);
            }
        }

        this.displayElement.style.fontFamily = this.settings.fontFamily || 'Arial';
        this.displayElement.style.fontSize = `${this.settings.fontSize || 24}px`;
        this.displayElement.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
        this.displayElement.style.display = 'flex';
        this.displayElement.style.flexDirection = 'column';
        this.displayElement.style.alignItems = 'stretch';
        this.displayElement.style.justifyContent = 'flex-start';
        this.displayElement.style.textAlign = 'justify';
        this.displayElement.style.margin = '0 auto';
        this.displayElement.style.maxWidth = '100%';
        this.displayElement.style.padding = '4px';
        this.displayElement.style.boxSizing = 'border-box';
        this.displayElement.style.wordWrap = 'break-word';
        this.displayElement.style.overflowWrap = 'break-word';
        this.displayElement.style.hyphens = 'auto';
        this.displayElement.style.lineHeight = '1.5';
        this.displayElement.style.border = '2px solid #ccc';
        this.displayElement.style.background = 'var(--background-primary)';
        this.displayElement.style.whiteSpace = 'pre-wrap';
        
        // Set base text color based on mode
        if (displayMode === 'SplitLetter') {
            this.displayElement.style.color = (this.settings as any).inactiveTextColor || '';
        } else {
            this.displayElement.style.color = (this.settings as any).activeTextColor || '';
        }
        
        if (displayMode === 'SplitLetter') {
            const splitLetterSettings = this.settings.splitLine?.splitLetter || { width: 600, height: 300 };
            this.displayElement.style.width = `${splitLetterSettings.width}px`;
            this.displayElement.style.height = `${splitLetterSettings.height}px`;
            this.displayElement.style.minWidth = '300px';
            this.displayElement.style.maxWidth = '800px';
            this.displayElement.style.minHeight = '60px';
        } else {
            const splitLineSettings = this.settings.splitLine?.splitLine || { 
                width: 600, 
                height: 300
            };
            this.displayElement.style.width = `${splitLineSettings.width}px`;
            this.displayElement.style.height = `${splitLineSettings.height}px`;
            this.displayElement.style.overflowY = 'auto';
            this.displayElement.style.overflowX = 'hidden';
        }
        
        this.displayElement.style.wordBreak = 'break-word';
        this.displayElement.style.overflowX = 'auto';
        this.displayElement.style.overflowY = 'auto';
        this.displayElement.style.position = 'relative';
    }

    public updateSettings(settings: SpeedReaderSettings): void {
        this.resetState();
        
        const displayMode = settings.splitLine?.displayMode || 'SplitLine';
        const splitLetterSettings = settings.splitLine?.splitLetter || { chunkSize: 1 };

        if (displayMode === 'SplitLetter') {
            settings.chunkSize = splitLetterSettings.chunkSize;
            if (this.onChunkSizeChange) {
                this.onChunkSizeChange(splitLetterSettings.chunkSize);
            }
        }

        this.settings = settings;

        this.lineWordMappings = [];
        this.totalHeight = 0;
        this.preparedParagraphs = 0;
        this.paragraphQueue = [...this.paragraphs];
        this.isProcessingQueue = false;
        this.lastVisibleParagraphIndex = -1;

        this.applyStyles();

        if (this.paragraphs.length > 0) {
            const { paragraphIndex } = this.globalToLocalIndex(this.globalCurrentIndex);
            this.loadParagraphWithBuffer(paragraphIndex, () => {
                this.highlightCurrentWords();
            });
        }
    }

    public update(text: string, words: string[], currentIndex: number) {
        const textChanged = text !== this.lastText;
        
        if (textChanged) {
            this.lastText = text;
            this.globalCurrentIndex = currentIndex;
            this.loadText(text);
        } else {
            // Ensure currentIndex doesn't exceed word count
            this.globalCurrentIndex = Math.min(currentIndex, this.words.length - 1);
            
            const { paragraphIndex } = this.globalToLocalIndex(this.globalCurrentIndex);
            
            if (paragraphIndex >= this.activeParagraphWindow.start && 
                paragraphIndex <= this.activeParagraphWindow.end) {
                
                const windowStart = this.paragraphWordOffsets[this.activeParagraphWindow.start];
                const newLocalIndex = Math.max(0, this.globalCurrentIndex - windowStart);
                
                const significantChange = Math.abs(newLocalIndex - this.currentIndex) > 2;
                const isWordVisible = this.isWordCurrentlyVisible(newLocalIndex);
                
                this.currentIndex = newLocalIndex;
                
                if (significantChange || !isWordVisible) {
                    this.scrollToCurrentWordImmediate();
                } else {
                    this.highlightCurrentWords();
                }
                
                this.checkParagraphBuffer();
            } else {
                this.loadParagraphWithBuffer(paragraphIndex);
            }
        }
    }

    private isWordCurrentlyVisible(wordIndex: number): boolean {
        if (!this.displayElement || wordIndex < 0 || wordIndex >= this.words.length) {
            return false;
        }
        
        let targetLineIndex = -1;
        for (let i = 0; i < this.lineWordMappings.length; i++) {
            const mapping = this.lineWordMappings[i];
            if (wordIndex >= mapping.start && wordIndex <= mapping.end) {
                targetLineIndex = i;
                break;
            }
        }
        
        if (targetLineIndex === -1) return false;
        
        const targetLine = this.lineWordMappings[targetLineIndex];
        const scrollTop = this.displayElement.scrollTop;
        const scrollBottom = scrollTop + this.displayElement.clientHeight;
        
        return targetLine.top >= scrollTop && targetLine.top + targetLine.height <= scrollBottom;
    }

    private throttledScrollHandler = (() => {
        let timeoutId: number | null = null;
        
        return () => {
            if (timeoutId !== null) return;
            
            timeoutId = window.setTimeout(() => {
                if (this.isRendering || this.isPreparing) {
                    timeoutId = null;
                    return;
                }
                
                this.scrollPosition = this.displayElement.scrollTop;
                this.calculateVisibleRange();
                this.requestRender();
                
                this.lastVisibleParagraphIndex = -1;
                this.checkParagraphBuffer();
                
                timeoutId = null;
            }, 16);
        };
    })();

    private checkParagraphBuffer() {
        this.lastVisibleParagraphIndex = -1;
        const lastVisiblePara = this.getLastVisibleParagraphIndex();
        const paragraphsNeeded = lastVisiblePara + this.bufferSize;
        
        if (paragraphsNeeded > this.preparedParagraphs && 
            !this.isProcessingQueue && 
            this.paragraphQueue.length > 0) {
            
            this.processBackgroundQueue();
        }
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
            placeholderEl.style.textAlign = 'center';
            return;
        }

        this.displayElement.empty();
        this.createVirtualContainer();
        this.calculateVisibleRange();
        this.requestRender();
    }

    public start(): void {
        this.isPlaying = true;
    }

    public stop(): void {
        this.isPlaying = false;
    }

    public destroy(): void {
        this.resetState();
    }

    public getCurrentIndex(): number {
        return this.globalCurrentIndex;
    }

    public setCurrentIndex(index: number): void {
        // Ensure index doesn't exceed word count
        this.globalCurrentIndex = Math.min(index, this.words.length - 1);
        
        const { paragraphIndex } = this.globalToLocalIndex(this.globalCurrentIndex);
        
        if (paragraphIndex >= this.activeParagraphWindow.start && 
            paragraphIndex <= this.activeParagraphWindow.end) {
            const windowStart = this.paragraphWordOffsets[this.activeParagraphWindow.start];
            this.currentIndex = Math.max(0, this.globalCurrentIndex - windowStart);
            
            this.scrollToCurrentWordImmediate();
            this.highlightCurrentWords();
            this.checkParagraphBuffer();
        } else {
            this.loadParagraphWithBuffer(paragraphIndex);
        }
    }

    private calculateVisibleRange() {
        if (!this.displayElement || this.lineWordMappings.length === 0) return;
        
        const containerHeight = this.displayElement.clientHeight;
        const scrollTop = this.scrollPosition || this.displayElement.scrollTop;
        
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
        if (this.isRendering || this.isPreparing) return;
        
        this.isRendering = true;
        this.renderFrameId = requestAnimationFrame(() => {
            this.renderVisibleLines();
            this.isRendering = false;
        });
    }

    private renderVisibleLines() {
        if (!this.displayElement || !this.virtualContainer) return;
        
        const newVisibleLines: HTMLElement[] = [];
        const currentLines = new Map<number, HTMLElement>();
        
        this.visibleLines.forEach(line => {
            const lineIndex = parseInt(line.dataset.lineIndex || '-1');
            if (lineIndex >= 0) {
                currentLines.set(lineIndex, line);
            } else {
                line.remove();
            }
        });
        
        for (let i = this.visibleStartIndex; i <= this.visibleEndIndex; i++) {
            let lineDiv = currentLines.get(i);
            
            if (!lineDiv) {
                lineDiv = this.createLineElement(i);
                this.virtualContainer.appendChild(lineDiv);
            }
            
            newVisibleLines.push(lineDiv);
        }
        
        currentLines.forEach((line, index) => {
            if (index < this.visibleStartIndex || index > this.visibleEndIndex) {
                line.remove();
            }
        });
        
        this.visibleLines = newVisibleLines;
        this.highlightCurrentWords();
    }

    private createLineElement(lineIndex: number): HTMLElement {
        const lineMapping = this.lineWordMappings[lineIndex];
        const lineDiv = document.createElement('div');
        lineDiv.className = 'linear-reader-line';
        lineDiv.dataset.lineIndex = lineIndex.toString();
        
        lineDiv.style.position = 'absolute';
        lineDiv.style.top = `${lineMapping.top}px`;
        lineDiv.style.left = '4px';
        lineDiv.style.right = '4px';
        lineDiv.style.width = 'auto';
        lineDiv.style.height = `${lineMapping.height}px`;
        lineDiv.style.minHeight = `${lineMapping.height}px`;
        lineDiv.style.display = 'block';
        lineDiv.style.padding = '2px 0';
        lineDiv.style.margin = '0';
        lineDiv.style.lineHeight = '1.5';
        lineDiv.style.boxSizing = 'border-box';
        lineDiv.style.wordWrap = 'break-word';
        lineDiv.style.overflowWrap = 'break-word';
        lineDiv.style.whiteSpace = 'normal';
        lineDiv.style.overflow = 'hidden';
        lineDiv.style.fontFamily = this.settings.fontFamily || 'Arial';
        lineDiv.style.fontSize = `${this.settings.fontSize || 24}px`;
        lineDiv.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
        lineDiv.style.textAlign = 'justify';
        (lineDiv.style as any)['textJustify'] = 'inter-word';
        lineDiv.style.textAlignLast = 'justify';
        
        (lineDiv.style as any)['webkitTextAlignLast'] = 'justify';
        (lineDiv.style as any)['mozTextAlignLast'] = 'justify';
        lineDiv.style.hyphens = 'auto';
        (lineDiv.style as any)['webkitHyphens'] = 'auto';
        
        const isLastLineInParagraph = this.isLastLineInParagraph(lineIndex);
        
        if (isLastLineInParagraph) {
            lineDiv.style.textAlignLast = 'left';
            (lineDiv.style as any)['webkitTextAlignLast'] = 'left';
            (lineDiv.style as any)['mozTextAlignLast'] = 'left';
            lineDiv.classList.add('paragraph-end');
        }
        
        const line = lineMapping.text;
        const wordsInLine = line.trim().split(/\s+/).filter(word => word.length > 0);
        let wordIndexInLine = 0;
        
        wordsInLine.forEach((word, index) => {
            const wordSpan = document.createElement('span');
            wordSpan.textContent = word;
            wordSpan.className = 'linear-reader-word';
            
            Object.assign(wordSpan.style, {
                cursor: 'default',
                padding: '1px 2px',
                margin: '0',
                borderRadius: '3px',
                transition: 'all 0.2s ease',
                display: 'inline',
                maxWidth: '100%',
                wordWrap: 'normal',
                overflowWrap: 'normal',
                whiteSpace: word.includes('-') ? 'nowrap' : 'normal',
                wordBreak: 'normal',
                letterSpacing: `${this.settings.letterSpacing || 0}px`
            });
            
            const wordIndex = lineMapping.start + wordIndexInLine;
            if (wordIndex < this.words.length) {
                this.wordElements[wordIndex] = wordSpan;
            }
            
            lineDiv.appendChild(wordSpan);
            
            if (index < wordsInLine.length - 1) {
                const spaceSpan = document.createElement('span');
                spaceSpan.textContent = ' ';
                spaceSpan.style.letterSpacing = '0px';
                spaceSpan.style.display = 'inline';
                lineDiv.appendChild(spaceSpan);
            }
            
            wordIndexInLine++;
        });
        
        return lineDiv;
    }

    private isLastLineInParagraph(lineIndex: number): boolean {
        if (lineIndex >= this.lineWordMappings.length - 1) {
            return true;
        }
        
        const currentLine = this.lineWordMappings[lineIndex];
        const nextLine = this.lineWordMappings[lineIndex + 1];
        const normalLineHeight = this.settings.fontSize * 1.5 || 36;
        const gap = nextLine.top - (currentLine.top + currentLine.height);
        
        return gap > normalLineHeight * 0.3;
    }

    private createVirtualContainer() {
        if (!this.displayElement) return;

        if (this.scrollHandler) {
            this.displayElement.removeEventListener('scroll', this.scrollHandler);
            this.scrollHandler = undefined;
        }

        this.virtualContainer = document.createElement('div');
        this.virtualContainer.className = 'linear-reader-virtual-container';
        this.virtualContainer.style.position = 'relative';
        this.virtualContainer.style.height = `${this.totalHeight}px`;
        this.virtualContainer.style.width = '100%';
        this.virtualContainer.style.overflow = 'visible';
        this.virtualContainer.style.flex = '1';
        this.virtualContainer.style.minHeight = '0';
        this.virtualContainer.style.padding = '0';
        this.virtualContainer.style.boxSizing = 'border-box';
        this.virtualContainer.style.textAlign = 'justify';
        (this.virtualContainer.style as any)['textJustify'] = 'inter-word';
        
        const displayMode = this.settings.splitLine?.displayMode || 'SplitLine';
        if (displayMode === 'SplitLine') {
            this.displayElement.style.overflowY = 'auto';
            this.displayElement.style.scrollbarWidth = 'thin';
            this.displayElement.style.scrollbarColor = 'var(--scrollbar-thumb-bg) var(--scrollbar-bg)';
        } else {
            this.displayElement.style.overflowY = 'hidden';
        }
        this.displayElement.style.overflowX = 'hidden';
        
        const style = document.createElement('style');
        style.textContent = `
            .speed-reader-display::-webkit-scrollbar {
                width: 12px;
            }
            .speed-reader-display::-webkit-scrollbar-track {
                background: var(--scrollbar-bg);
            }
            .speed-reader-display::-webkit-scrollbar-thumb {
                background: var(--scrollbar-thumb-bg);
                border-radius: 6px;
            }
            .linear-reader-line {
                text-align: justify !important;
                text-align-last: justify !important;
                -webkit-text-align-last: justify !important;
                -moz-text-align-last: justify !important;
                text-justify: inter-word !important;
                -webkit-text-justify: inter-word !important;
                -moz-text-justify: inter-word !important;
                word-spacing: normal !important;
                width: 100% !important;
                max-width: 100% !important;
                display: block !important;
                box-sizing: border-box !important;
                hyphens: auto !important;
                -webkit-hyphens: auto !important;
                -moz-hyphens: auto !important;
            }
            .linear-reader-line:last-child,
            .linear-reader-line.paragraph-end {
                text-align-last: left !important;
                -webkit-text-align-last: left !important;
                -moz-text-align-last: left !important;
            }
            .linear-reader-word {
                letter-spacing: inherit !important;
                display: inline !important;
                word-break: normal !important;
                overflow-wrap: normal !important;
            }
            .linear-reader-virtual-container {
                text-align: justify !important;
                width: 100% !important;
                display: block !important;
                box-sizing: border-box !important;
            }
            .speed-reader-display {
                text-align: justify !important;
                text-justify: inter-word !important;
            }
        `;
        if (!document.querySelector('style[data-linear-reader]')) {
            style.setAttribute('data-linear-reader', 'true');
            document.head.appendChild(style);
        }
        
        this.displayElement.appendChild(this.virtualContainer);
        
        this.scrollHandler = () => {
            if (this.isRendering || this.isPreparing) return;
            
            const now = Date.now();
            if (now - this.lastScrollTime < 50) return;
            
            this.lastScrollTime = now;
            this.scrollPosition = this.displayElement.scrollTop;
            this.calculateVisibleRange();
            this.requestRender();
            
            this.lastVisibleParagraphIndex = -1;
            this.checkParagraphBuffer();
        };
        
        this.displayElement.addEventListener('scroll', this.scrollHandler, { passive: true });
        
        this.calculateVisibleRange();
        this.requestRender();
    }

    private highlightCurrentWords() {
        const displayMode = this.settings.splitLine?.displayMode || 'SplitLine';

        // Reset previously highlighted words
        this.highlightedWords.forEach(el => {
            if (el.parentElement) {
                if (displayMode === 'SplitLetter') {
                    el.style.color = (this.settings as any).inactiveTextColor || '';
                } else {
                    el.style.color = (this.settings as any).activeTextColor || '';
                }
            }
        });
        this.highlightedWords = [];

        // Reset previously highlighted characters by restoring the original word text
        this.highlightedCharacters.forEach(el => {
            const parentWord = el.parentElement;
            if (parentWord) {
                for (let i = 0; i < this.wordElements.length; i++) {
                    if (this.wordElements[i] === parentWord) {
                        if (parentWord.childNodes.length > 1 || (parentWord.firstChild && parentWord.firstChild.nodeType !== Node.TEXT_NODE)) {
                            parentWord.textContent = this.words[i];
                        }
                        break;
                    }
                }
            }
        });
        this.highlightedCharacters = [];

        const lineIndex = this.findLineIndexForWord(this.currentIndex);
        if (lineIndex === -1 || !this.lineWordMappings[lineIndex]) return;

        const lineMapping = this.lineWordMappings[lineIndex];
        const lineStartIndex = lineMapping.start;
        const lineEndIndex = Math.min(lineMapping.end, this.words.length - 1);
        const wordsInLineCount = lineEndIndex - lineStartIndex + 1;

        if (wordsInLineCount <= 0) return;

        // --- NEW: Visual Split Logic ---
        let splitIndex: number;

        const lineElement = this.visibleLines.find(line =>
            parseInt(line.dataset.lineIndex || '-1') === lineIndex
        );

        // Use visual calculation only if the line is currently rendered in the DOM
        if (lineElement && lineElement.offsetParent !== null) {
            const lineRect = lineElement.getBoundingClientRect();
            const lineCenterX = lineRect.left + lineRect.width / 2;

            const wordElementsOnLine = Array.from(lineElement.querySelectorAll('.linear-reader-word')) as HTMLElement[];
            let splitIndexInLine = -1;

            for (let i = 0; i < wordElementsOnLine.length; i++) {
                const wordEl = wordElementsOnLine[i];
                if (wordEl.offsetParent !== null) {
                    const wordRect = wordEl.getBoundingClientRect();
                    const wordCenterX = wordRect.left + wordRect.width / 2;

                    // Find the first word whose center is past the line's center
                    if (wordCenterX > lineCenterX) {
                        splitIndexInLine = i;
                        break;
                    }
                }
            }

            // If the split point is at the very beginning or not found, fall back to mathematical split for this line
            // This handles cases with unusual alignment or very long first words.
            if (splitIndexInLine <= 0) {
                splitIndex = lineStartIndex + Math.ceil(wordsInLineCount / 2);
            } else {
                splitIndex = lineStartIndex + splitIndexInLine;
            }

        } else {
            // Fallback to index-based calculation if line is not rendered
            splitIndex = lineStartIndex + Math.ceil(wordsInLineCount / 2);
        }
        // --- END: Visual Split Logic ---

        const isLeftHalfActive = this.currentIndex < splitIndex;

        const highlightStart = isLeftHalfActive ? lineStartIndex : splitIndex;
        const highlightEnd = isLeftHalfActive ? splitIndex - 1 : lineEndIndex;
        
        if (highlightStart > highlightEnd) return;

        const wordsInChunk = highlightEnd - highlightStart + 1;
        if (this.onChunkSizeChange) {
            this.onChunkSizeChange(wordsInChunk);
        }

        const activeHalfWordElements: HTMLElement[] = [];
        for (let i = highlightStart; i <= highlightEnd; i++) {
            const wordElement = this.wordElements[i];
            if (wordElement) {
                activeHalfWordElements.push(wordElement);
            }
        }
        
        if (displayMode === 'SplitLetter') {
            for (let i = lineStartIndex; i <= lineEndIndex; i++) {
                const wordElement = this.wordElements[i];
                if (wordElement && wordElement.parentElement) {
                    wordElement.style.color = (this.settings as any).inactiveTextColor || '';
                }
            }
            
            activeHalfWordElements.forEach(wordElement => {
                wordElement.style.color = (this.settings as any).activeTextColor || '#ff6b6b';
                this.highlightedWords.push(wordElement);
            });
            
            this.highlightCenterLetter(activeHalfWordElements);

        } else { // 'SplitLine' mode
            for (let i = lineStartIndex; i <= lineEndIndex; i++) {
                const wordElement = this.wordElements[i];
                if (wordElement && wordElement.parentElement && !activeHalfWordElements.includes(wordElement)) {
                    wordElement.style.color = (this.settings as any).activeTextColor || '';
                }
            }

            activeHalfWordElements.forEach(wordElement => {
                wordElement.style.color = this.settings.highlightColor || '#ff6b6b';
                this.highlightedWords.push(wordElement);
            });
        }
    }

    private highlightCenterLetter(wordElements: HTMLElement[]) {
        if (wordElements.length === 0) return;
        
        // Calculate the content boundaries of the provided group of words
        let leftmostX = Infinity;
        let rightmostX = -Infinity;
        
        for (const wordElement of wordElements) {
            if (wordElement.offsetParent !== null) {
                const rect = wordElement.getBoundingClientRect();
                leftmostX = Math.min(leftmostX, rect.left);
                rightmostX = Math.max(rightmostX, rect.right);
            }
        }
        
        if (leftmostX === Infinity) return;

        // Find the visual center of the text content for this group
        const centerX = (leftmostX + rightmostX) / 2;
        
        // Find the word closest to the center within the group
        let closestWord: HTMLElement | null = null;
        let minWordDistance = Infinity;
        
        for (const wordElement of wordElements) {
            if (wordElement.offsetParent !== null) {
                const wordRect = wordElement.getBoundingClientRect();
                const wordCenterX = wordRect.left + wordRect.width / 2;
                const distance = Math.abs(wordCenterX - centerX);
                
                if (distance < minWordDistance) {
                    minWordDistance = distance;
                    closestWord = wordElement;
                }
            }
        }
        
        if (!closestWord) return;
        
        const wordText = closestWord.textContent || '';
        if (wordText === '') return;
        
        closestWord.innerHTML = ''; // Clear the word to add character spans
        
        const charSpans: HTMLElement[] = [];
        
        // Create spans for each character to measure them
        for (let i = 0; i < wordText.length; i++) {
            const charSpan = document.createElement('span');
            charSpan.textContent = wordText[i];
            charSpan.style.display = 'inline';
            closestWord.appendChild(charSpan);
            charSpans.push(charSpan);
        }
        
        // Find the character closest to the group's center
        let closestCharIndex = -1;
        let minCharDistance = Infinity;
        
        for (const [charIndex, charSpan] of charSpans.entries()) {
            const charRect = charSpan.getBoundingClientRect();
            const charCenterX = charRect.left + charRect.width / 2;
            const distance = Math.abs(charCenterX - centerX);
            
            if (distance < minCharDistance) {
                minCharDistance = distance;
                closestCharIndex = charIndex;
            }
        }
        
        // Reconstruct the word with the highlighted character
        closestWord.innerHTML = '';
        for (let i = 0; i < wordText.length; i++) {
            const charSpan = document.createElement('span');
            charSpan.textContent = wordText[i];
            
            if (i === closestCharIndex) {
                charSpan.style.color = this.settings.highlightColor || '#ff6b6b';
            } else {
                charSpan.style.color = 'inherit'; // Inherit color from the parent word span
            }
            
            closestWord.appendChild(charSpan);
            // Add all character spans to highlightedCharacters for cleanup on the next update
            this.highlightedCharacters.push(charSpan);
        }
    }

    private findLineIndexForWord(wordIndex: number): number {
        // Handle case where wordIndex is beyond the last word
        if (wordIndex >= this.words.length) {
            return this.lineWordMappings.length - 1; // Return the last line
        }
        
        for (let i = 0; i < this.lineWordMappings.length; i++) {
            const mapping = this.lineWordMappings[i];
            if (wordIndex >= mapping.start && wordIndex <= mapping.end) {
                return i;
            }
        }
        
        // If we didn't find a line, return the last line
        return this.lineWordMappings.length > 0 ? this.lineWordMappings.length - 1 : -1;
    }

    private scrollToCurrentWord() {
        if (!this.displayElement || this.currentIndex < 0 || this.currentIndex >= this.words.length) {
            return;
        }

        let targetLineIndex = -1;
        for (let i = 0; i < this.lineWordMappings.length; i++) {
            const mapping = this.lineWordMappings[i];
            if (this.currentIndex >= mapping.start && this.currentIndex <= mapping.end) {
                targetLineIndex = i;
                break;
            }
        }
        
        if (targetLineIndex === -1) {
            return;
        }

        const targetLine = this.lineWordMappings[targetLineIndex];
        const containerHeight = this.displayElement.clientHeight;
        
        const bufferSpace = containerHeight * 0.4;
        const targetScroll = Math.max(0, targetLine.top - bufferSpace);
        this.displayElement.scrollTop = targetScroll;
        
        setTimeout(() => {
            this.calculateVisibleRange();
            this.requestRender();
            
            setTimeout(() => {
                this.checkAndAdjustCentering();
            }, 100);
        }, 10);
    }

    private calculateLineHeight(text: string, containerWidth: number, settings: SpeedReaderSettings): number {
        const tempDiv = document.createElement('div');
        const effectiveWidth = Math.max(200, containerWidth);
        tempDiv.style.width = `${effectiveWidth}px`;
        tempDiv.style.maxWidth = `${effectiveWidth}px`;
        tempDiv.style.position = 'absolute';
        tempDiv.style.visibility = 'hidden';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '0';
        tempDiv.style.fontFamily = settings.fontFamily || 'Arial';
        tempDiv.style.fontSize = `${settings.fontSize || 24}px`;
        tempDiv.style.letterSpacing = `${settings.letterSpacing || 0}px`;
        tempDiv.style.lineHeight = '1.5';
        tempDiv.style.fontWeight = 'inherit';
        tempDiv.style.wordWrap = 'break-word';
        tempDiv.style.overflowWrap = 'break-word';
        tempDiv.style.whiteSpace = 'normal';
        tempDiv.style.padding = '4px 4px';
        tempDiv.style.boxSizing = 'border-box';
        tempDiv.style.textAlign = 'justify';
        (tempDiv.style as any)['textJustify'] = 'inter-word';
        tempDiv.style.textAlignLast = 'justify';
        
        const words = text.trim().split(/\s+/).filter(word => word.length > 0);
        let html = '';
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const escaped = word.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            if (word.includes('-')) {
                html += `<span style="white-space:nowrap;word-break:normal;letter-spacing:${settings.letterSpacing || 0}px;">${escaped}</span>`;
            } else {
                html += `<span style="white-space:normal;word-break:break-word;letter-spacing:${settings.letterSpacing || 0}px;">${escaped}</span>`;
            }
            if (i < words.length - 1) {
                html += '<span style="letter-spacing:0px;"> </span>';
            }
        }
        tempDiv.innerHTML = html || ' ';

        document.body.appendChild(tempDiv);
        const height = tempDiv.scrollHeight;
        document.body.removeChild(tempDiv);

        const minLineHeight = Math.max(settings.fontSize * 1.5 || 36, height);
        return minLineHeight;
    }
}