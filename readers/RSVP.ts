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
        this.displayElement.style.overflow = 'hidden';
    }

    private applyMultiLineStyles() {
        const multiLineSettings = this.settings.rsvp?.multiLine || { rows: 3, width: 400 };
        const lineHeight = 1.4;
        const fontSize = this.settings.fontSize || 24;
        const calculatedHeight = (fontSize * lineHeight * multiLineSettings.rows) + 40; // 40px for padding

        this.displayElement.style.borderRadius = '10px';
        this.displayElement.style.width = `${multiLineSettings.width}px`;
        this.displayElement.style.height = `${calculatedHeight}px`;
        this.displayElement.style.whiteSpace = 'normal';
        this.displayElement.style.overflow = 'hidden';
        this.displayElement.style.lineHeight = lineHeight.toString();
    }

    private applyEllipseStyles() {
        const ellipseSettings = this.settings.rsvp?.ellipse || { width: 300, height: 200 };
        
        this.displayElement.style.borderRadius = '50%';
        this.displayElement.style.width = `${ellipseSettings.width}px`;
        this.displayElement.style.height = `${ellipseSettings.height}px`;
        this.displayElement.style.whiteSpace = 'normal';
        this.displayElement.style.overflow = 'hidden';
    }

    public updateSettings(settings: SpeedReaderSettings) {
        this.settings = settings;
        this.applyStyles();
    }

    private getOptimalChunkSize(startIndex: number): number {
        const displayMode = this.settings.rsvp?.displayMode || 'ellipse';
        
        switch (displayMode) {
            case 'single-line':
                return this.getOptimalChunkSizeSingleLine(startIndex);
            case 'multi-line':
                return this.getOptimalChunkSizeMultiLine(startIndex);
            case 'ellipse':
            default:
                return this.getOptimalChunkSizeEllipse(startIndex);
        }
    }

    private getOptimalChunkSizeSingleLine(startIndex: number): number {
        // U single-line modu, chunkSize je direktno vezan sa brojem reči
        const maxSize = Math.min(this.settings.chunkSize, this.words.length - startIndex);
        
        // Proveravamo da li se sve reči uklapaju u liniju
        let optimalSize = 1;
        const maxWidth = 760; // Max width minus padding
        
        for (let size = 1; size <= maxSize; size++) {
            const chunk = [];
            for (let i = 0; i < size && (startIndex + i) < this.words.length; i++) {
                chunk.push(this.words[startIndex + i]);
            }
            const testText = chunk.join(' ');
            
            if (this.doesTextFitInSingleLine(testText, maxWidth)) {
                optimalSize = size;
            } else {
                break;
            }
        }
        
        return optimalSize;
    }

    private getOptimalChunkSizeMultiLine(startIndex: number): number {
        const multiLineSettings = this.settings.rsvp?.multiLine || { rows: 3, width: 400 };
        const maxWidth = multiLineSettings.width - 40; // Width minus padding
        const maxHeight = this.calculateMultiLineHeight() - 40; // Height minus padding
        
        let optimalSize = 1;
        const maxSize = Math.min(this.words.length - startIndex, 100); // Razumna gornja granica
        
        for (let size = 1; size <= maxSize; size++) {
            const chunk = [];
            for (let i = 0; i < size && (startIndex + i) < this.words.length; i++) {
                chunk.push(this.words[startIndex + i]);
            }
            const testText = chunk.join(' ');
            
            if (this.doesTextFitInRectangle(testText, maxWidth, maxHeight)) {
                optimalSize = size;
            } else {
                break;
            }
        }
        
        return optimalSize;
    }

    private getOptimalChunkSizeEllipse(startIndex: number): number {
        const ellipseSettings = this.settings.rsvp?.ellipse || { width: 300, height: 200 };
        const maxWidth = ellipseSettings.width - 40; // Width minus padding
        const maxHeight = ellipseSettings.height - 40; // Height minus padding
        
        let optimalSize = 1;
        const maxSize = Math.min(this.words.length - startIndex, 100); // Razumna gornja granica
        
        for (let size = 1; size <= maxSize; size++) {
            const chunk = [];
            for (let i = 0; i < size && (startIndex + i) < this.words.length; i++) {
                chunk.push(this.words[startIndex + i]);
            }
            const testText = chunk.join(' ');
            
            if (this.doesTextFitInEllipse(testText, maxWidth, maxHeight)) {
                optimalSize = size;
            } else {
                break;
            }
        }
        
        return optimalSize;
    }

    private calculateMultiLineHeight(): number {
        const multiLineSettings = this.settings.rsvp?.multiLine || { rows: 3, width: 400 };
        const lineHeight = 1.4;
        const fontSize = this.settings.fontSize || 24;
        return (fontSize * lineHeight * multiLineSettings.rows) + 40;
    }

    private doesTextFitInSingleLine(text: string, maxWidth: number): boolean {
        const testElement = this.createTestElement();
        testElement.style.width = 'auto';
        testElement.style.whiteSpace = 'nowrap';
        testElement.textContent = text;
        
        document.body.appendChild(testElement);
        const fits = testElement.scrollWidth <= maxWidth;
        document.body.removeChild(testElement);
        
        return fits;
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
        const testElement = this.createTestElement();
        testElement.style.width = `${maxWidth}px`;
        testElement.style.whiteSpace = 'normal';
        testElement.textContent = text;
        
        document.body.appendChild(testElement);
        const fits = testElement.scrollHeight <= maxHeight;
        document.body.removeChild(testElement);
        
        return fits;
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
            // Apply styles to placeholder
            placeholderEl.style.fontFamily = this.settings.fontFamily || 'Arial';
            placeholderEl.style.fontSize = `${this.settings.fontSize || 24}px`;
            placeholderEl.style.color = '#999';
            return;
        }

        this.displayElement.empty();
        const wordEl = this.displayElement.createEl('div', { cls: 'current-word' });
        
        if (this.currentIndex < this.words.length) {
            // Pronađi optimalnu količinu reči koja se uklapa u display area
            const optimalChunkSize = this.getOptimalChunkSize(this.currentIndex);
            
            // Dinamički ažuriraj chunkSize u multi-line i ellipse modovima
            const displayMode = this.settings.rsvp?.displayMode || 'ellipse';
            if (displayMode === 'multi-line' || displayMode === 'ellipse') {
                if (optimalChunkSize !== this.settings.chunkSize) {
                    this.settings.chunkSize = optimalChunkSize;
                    this.onChunkSizeChange(optimalChunkSize);
                }
            }
            
            const chunk = [];
            for (let i = 0; i < optimalChunkSize && (this.currentIndex + i) < this.words.length; i++) {
                chunk.push(this.words[this.currentIndex + i]);
            }
            wordEl.textContent = chunk.join(' ');
        } else {
            wordEl.textContent = 'Reading complete!';
        }

        // Apply all styles
        wordEl.style.color = this.settings.highlightColor || '#ff6b6b';
        wordEl.style.fontFamily = this.settings.fontFamily || 'Arial';
        wordEl.style.fontSize = `${this.settings.fontSize || 24}px`;
        wordEl.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
    }

    // Dodaj metodu za dobijanje trenutne chunk veličine
    getCurrentChunkSize(): number {
        if (this.words.length === 0 || this.currentIndex >= this.words.length) {
            return 0;
        }
        return this.getOptimalChunkSize(this.currentIndex);
    }
}