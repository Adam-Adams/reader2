import { SpeedReaderSettings } from '../main';

export class RSVP {
    private element: HTMLElement;
    private text: string;
    private words: string[];
    private currentIndex: number;
    private settings: SpeedReaderSettings;
    private displayElement: HTMLDivElement;
    private onChunkSizeChange: (newSize: number) => void;

    constructor(element: HTMLElement, settings: SpeedReaderSettings, onChunkSizeChange?: (newSize: number) => void) {
        this.element = element;
        this.settings = settings;
        this.text = '';
        this.words = [];
        this.currentIndex = 0;
        this.onChunkSizeChange = onChunkSizeChange || (() => {});

        // Create display section
        const textSection = this.element.createDiv('speed-reader-text-section');
        this.displayElement = textSection.createDiv('speed-reader-display');
        this.displayElement.createEl('div', { 
            text: 'Select text or load a file to start reading',
            cls: 'placeholder-text'
        });

        // Apply initial styles
        this.applyStyles();
    }

    public applyStyles() {
        const displayMode = this.settings.rsvp?.displayMode || 'ellipse';
        const rsvpSettings = this.settings.rsvp || {};

        // Reset basic styles
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
        this.displayElement.style.border = '2px solid #ccc';

        switch (displayMode) {
            case 'single-line':
                this.applySingleLineStyles();
                break;
            case 'multi-line':
                this.applyMultiLineStyles();
                break;
            case 'ellipse':
            default:
                this.applyEllipseStyles();
                break;
        }

        // Apply color to current word element if it exists
        const currentWordEl = this.displayElement.querySelector('.current-word') as HTMLElement;
        if (currentWordEl) {
            currentWordEl.style.color = this.settings.highlightColor || '#ff6b6b';
            currentWordEl.style.fontFamily = this.settings.fontFamily || 'Arial';
            currentWordEl.style.fontSize = `${this.settings.fontSize || 24}px`;
            currentWordEl.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
        }
    }

    private applySingleLineStyles() {
        this.displayElement.style.borderRadius = '25px';
        this.displayElement.style.width = 'auto';
        this.displayElement.style.minWidth = '300px';
        this.displayElement.style.maxWidth = '800px';
        this.displayElement.style.height = 'auto';
        this.displayElement.style.minHeight = '60px';
        this.displayElement.style.whiteSpace = 'nowrap';
        // Allow horizontal scrolling for long words
        this.displayElement.style.overflowX = 'auto';
        this.displayElement.style.overflowY = 'hidden';
    }

    private applyMultiLineStyles() {
        const multiLineSettings = this.settings.rsvp?.multiLine || { rows: 3, width: 400 };
        const fontSize = this.settings.fontSize || 24;
        const lineHeightPx = Math.floor(fontSize * 1.4);
        const padding = 20;

        this.displayElement.style.borderRadius = '10px';
        this.displayElement.style.width = `${multiLineSettings.width}px`;
        this.displayElement.style.height = `${(lineHeightPx * multiLineSettings.rows) + (padding * 2)}px`;
        this.displayElement.style.whiteSpace = 'normal';
        this.displayElement.style.overflow = 'hidden';
        this.displayElement.style.lineHeight = `${lineHeightPx}px`;
        this.displayElement.style.padding = `${padding}px`;
    }

    private applyEllipseStyles() {
        const ellipseSettings = this.settings.rsvp?.ellipse || { width: 300, height: 200 };
        const width = ellipseSettings.width;
        const height = ellipseSettings.height;
        
        this.displayElement.style.borderRadius = '50%';
        this.displayElement.style.width = `${width}px`;
        this.displayElement.style.height = `${height}px`;
        this.displayElement.style.whiteSpace = 'normal';
        this.displayElement.style.overflow = 'hidden';
        this.displayElement.style.display = 'flex';
        this.displayElement.style.flexDirection = 'column';
        this.displayElement.style.justifyContent = 'center';
        this.displayElement.style.alignItems = 'center';
        this.displayElement.style.padding = '0';
        this.displayElement.style.boxSizing = 'border-box';
        
        // Create elliptical clipping
        this.displayElement.style.clipPath = `ellipse(${width/2}px ${height/2}px at 50% 50%)`;
    }

    public updateSettings(settings: SpeedReaderSettings) {
        this.settings = settings;
        this.applyStyles();
    }

    private getOptimalChunkSize(startIndex: number): number {
        const displayMode = this.settings.rsvp?.displayMode || 'ellipse';
        
        switch (displayMode) {
            case 'single-line':
                // SIMPLIFIED: Always use the configured chunk size for single-line mode
                return Math.min(this.settings.chunkSize, this.words.length - startIndex);
            case 'multi-line':
                return this.getOptimalChunkSizeMultiLine(startIndex);
            case 'ellipse':
            default:
                return this.getOptimalChunkSizeEllipse(startIndex);
        }
    }

    private getOptimalChunkSizeMultiLine(startIndex: number): number {
        const multiLineSettings = this.settings.rsvp?.multiLine || { rows: 3, width: 400 };
        return Math.min(this.settings.chunkSize, this.words.length - startIndex);
    }

    private getOptimalChunkSizeEllipse(startIndex: number): number {
        const ellipseSettings = this.settings.rsvp?.ellipse || { width: 300, height: 200 };
        const padding = 15;
        const maxWidth = ellipseSettings.width - 2 * padding;
        const maxHeight = ellipseSettings.height - 2 * padding;
        const fontSize = this.settings.fontSize || 24;
        const lineHeight = fontSize * 1.2;
        
        const MAX_CHUNK_SIZE = 100;
        const maxSize = Math.min(this.words.length - startIndex, MAX_CHUNK_SIZE);
        const chunk = this.words.slice(startIndex, startIndex + maxSize);
        
        // Get actual number of words that fit
        const layout = this.layoutTextInEllipse(chunk, maxWidth, maxHeight, lineHeight);
        
        // Return actual words used (minimum 1 word)
        return Math.max(1, layout.wordsUsed);
    }

    private calculateMultiLineHeight(): number {
        const multiLineSettings = this.settings.rsvp?.multiLine || { rows: 3, width: 400 };
        const lineHeight = 1.4;
        const fontSize = this.settings.fontSize || 24;
        return (fontSize * lineHeight * multiLineSettings.rows) + 40;
    }

    private doesTextFitInRectangle(text: string, maxWidth: number, maxHeight: number): boolean {
        const testElement = this.createTestElement();
        testElement.style.width = `${maxWidth}px`;
        testElement.style.whiteSpace = 'normal';
        testElement.textContent = text;
        
        document.body.appendChild(testElement);
        const fits = testElement.scrollHeight <= maxHeight;
        document.body.removeChild(testElement);
        
        return fits;
    }

    private doesTextFitInEllipse(text: string, maxWidth: number, maxHeight: number): boolean {
        const words = text.split(' ');
        const fontSize = this.settings.fontSize || 24;
        const lineHeight = fontSize * 1.2;
        
        // Pokušaj da rasporedi tekst u elipsi
        const layout = this.layoutTextInEllipse(words, maxWidth, maxHeight, lineHeight);
        return layout.success;
    }

    private layoutTextInEllipse(words: string[], maxWidth: number, maxHeight: number, lineHeight: number): {success: boolean, lines: string[], wordsUsed: number} {
        const lines: string[] = [];
        let currentLine: string[] = [];
        let currentY = lineHeight / 2; // Počni od vrha
        let wordIndex = 0;
        let wordsUsed = 0;
        
        while (wordIndex < words.length) {
            const word = words[wordIndex];
            
            // Testiramo da li možemo dodati reč u trenutnu liniju
            const testLine = currentLine.length === 0 ? word : currentLine.join(' ') + ' ' + word;
            const textWidth = this.measureTextWidth(testLine);
            const availableWidth = this.getEllipseWidthAtY(currentY, maxWidth, maxHeight);
            
            if (textWidth <= availableWidth && availableWidth > 0) {
                currentLine.push(word);
                wordIndex++;
                wordsUsed++;
            } else {
                // Trenutna linija je puna ili nema mesta
                if (currentLine.length === 0) {
                    // Čak ni jedna reč ne može da stane u trenutnu liniju
                    // Pokušaj sa sledećom linijom
                    currentY += lineHeight;
                    if (currentY + lineHeight / 2 > maxHeight) {
                        // Nema više mesta, završi sa trenutnim stanjem
                        break;
                    }
                    continue;
                } else {
                    // Sačuvaj trenutnu liniju i pređi na sledeću
                    lines.push(currentLine.join(' '));
                    currentLine = [];
                    currentY += lineHeight;
                    
                    // Proveri da li ima mesta za sledeću liniju
                    if (currentY + lineHeight / 2 > maxHeight) {
                        // Nema više mesta, završi
                        break;
                    }
                }
            }
        }
        
        // Dodaj poslednju liniju ako nije prazna
        if (currentLine.length > 0) {
            lines.push(currentLine.join(' '));
        }
        
        // Success je true samo ako je najmanje jedna reč uspešno uključena
        const success = wordsUsed > 0 && lines.length > 0;
        
        return { success, lines, wordsUsed };
    }

    private getEllipseWidthAtY(y: number, maxWidth: number, maxHeight: number): number {
        const a = maxWidth / 2;  // polu-širina elipse
        const b = maxHeight / 2; // polu-visina elipse
        const centerY = maxHeight / 2;
        
        // Relativna pozicija od centra elipse
        const relativeY = Math.abs(y - centerY);
        const normalizedY = relativeY / b;
        
        // Ako je van elipse, nema širine
        if (normalizedY >= 1) return 0;
        
        // Računanje širine na datoj visini koristeći jednačinu elipse
        const xHalf = a * Math.sqrt(1 - normalizedY * normalizedY);
        return Math.max(0, xHalf * 2 * 0.98); // 98% širine - skoro puna širina
    }

    private measureTextWidth(text: string): number {
        const testElement = this.createTestElement();
        testElement.style.whiteSpace = 'nowrap';
        testElement.textContent = text;
        
        document.body.appendChild(testElement);
        const width = testElement.scrollWidth;
        document.body.removeChild(testElement);
        
        return width;
    }

    private createTestElement(): HTMLDivElement {
        const testElement = document.createElement('div');
        testElement.style.fontSize = `${this.settings.fontSize || 24}px`;
        testElement.style.fontFamily = this.settings.fontFamily || 'Arial';
        testElement.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
        testElement.style.visibility = 'hidden';
        testElement.style.position = 'absolute';
        testElement.style.textAlign = 'center';
        testElement.style.wordWrap = 'break-word';
        testElement.style.overflowWrap = 'break-word';
        testElement.style.lineHeight = '1.2';
        return testElement;
    }

    update(text: string, words: string[], currentIndex: number) {
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
        
        const displayMode = this.settings.rsvp?.displayMode || 'ellipse';
        
        if (this.currentIndex < this.words.length) {
            const optimalChunkSize = this.getOptimalChunkSize(this.currentIndex);
            
            // Dynamically update chunkSize for multi-line and ellipse modes
            if (displayMode === 'multi-line' || displayMode === 'ellipse') {
                if (optimalChunkSize !== this.settings.chunkSize) {
                    this.settings.chunkSize = optimalChunkSize;
                    this.onChunkSizeChange(optimalChunkSize);
                }
            }
            
            // FIX: Always take at least 1 word, and up to remaining words
            //const remainingWords = this.words.length - this.currentIndex;
            //const actualChunkSize = Math.min(optimalChunkSize, remainingWords);
            
            const chunk = [];
            for (let i = 0; i < optimalChunkSize && (this.currentIndex + i) < this.words.length; i++) {
                chunk.push(this.words[this.currentIndex + i]);
            }
            
            if (displayMode === 'ellipse') {
                this.renderTextInEllipse(chunk);
            } else {
                this.renderSimpleChunk(chunk, displayMode);
            }
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

    private renderSimpleChunk(chunk: string[], displayMode: string) {
        const wordEl = this.displayElement.createEl('div', { cls: 'current-word' });
        wordEl.textContent = chunk.join(' ');

        // Common styles
        wordEl.style.color = this.settings.highlightColor || '#ff6b6b';
        wordEl.style.fontFamily = this.settings.fontFamily || 'Arial';
        wordEl.style.fontSize = `${this.settings.fontSize || 24}px`;
        wordEl.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
        wordEl.style.textAlign = 'center';
        wordEl.style.margin = '0';

        // Multi-line specific styles
        if (displayMode === 'multi-line') {
            wordEl.style.width = '100%';
            wordEl.style.whiteSpace = 'normal';
            wordEl.style.display = 'block';
            wordEl.style.overflow = 'hidden';
            wordEl.style.textOverflow = 'ellipsis';
            wordEl.style.lineHeight = `${Math.floor((this.settings.fontSize || 24) * 1.4)}px`;
            wordEl.style.maxHeight = `${Math.floor((this.settings.fontSize || 24) * 1.4 * 
                (this.settings.rsvp?.multiLine?.rows || 3))}px`;
        } 
        // Single-line styles remain unchanged
        else if (displayMode === 'single-line') {
            wordEl.style.display = 'inline-block';
            wordEl.style.whiteSpace = 'nowrap';
            wordEl.style.width = 'auto';
        }
    }

    private renderTextInEllipse(words: string[]) {
        const ellipseSettings = this.settings.rsvp?.ellipse || { width: 300, height: 200 };
        const padding = 15;
        const maxWidth = ellipseSettings.width - 2 * padding;
        const maxHeight = ellipseSettings.height - 2 * padding;
        const fontSize = this.settings.fontSize || 24;
        const lineHeight = fontSize * 1.2;
        
        // Kreiraj layout
        const layout = this.layoutTextInEllipse(words, maxWidth, maxHeight, lineHeight);
        
        if (!layout.success) {
            // Fallback - prikaži sve reči u jednom redu
            const wordEl = this.displayElement.createEl('div', { 
                text: words.join(' '),
                cls: 'current-word'
            });
            this.styleWordElement(wordEl);
            return;
        }
        
        // Kreiraj kontejner za tekst
        const textContainer = this.displayElement.createEl('div', { cls: 'text-container' });
        textContainer.style.position = 'relative';
        textContainer.style.width = '100%';
        textContainer.style.height = '100%';
        textContainer.style.display = 'flex';
        textContainer.style.flexDirection = 'column';
        textContainer.style.justifyContent = 'flex-start';
        textContainer.style.alignItems = 'center';
        
        // Dodaj svaku liniju počevši od vrha
        layout.lines.forEach((line, index) => {
            const lineEl = textContainer.createEl('div', { 
                text: line,
                cls: 'text-line'
            });
            
            lineEl.style.position = 'absolute';
            lineEl.style.top = `${padding + index * lineHeight}px`;
            lineEl.style.left = '50%';
            lineEl.style.transform = 'translateX(-50%)';
            lineEl.style.whiteSpace = 'nowrap';
            lineEl.style.textAlign = 'center';
            lineEl.style.width = 'auto';
            lineEl.style.maxWidth = '100%';
            
            this.styleWordElement(lineEl);
        });
    }

    private styleWordElement(element: HTMLElement) {
        element.style.color = this.settings.highlightColor || '#ff6b6b';
        element.style.fontFamily = this.settings.fontFamily || 'Arial';
        element.style.fontSize = `${this.settings.fontSize || 24}px`;
        element.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
        element.style.margin = '0';
        element.style.padding = '0';
    }

    getCurrentChunkSize(): number {
        if (this.words.length === 0 || this.currentIndex >= this.words.length) {
            return 0;
        }
        return this.getOptimalChunkSize(this.currentIndex);
    }
}