import { SpeedReaderSettings } from '../main';

export class RSVP {
    private element: HTMLElement;
    private text: string;
    private words: string[];
    private currentIndex: number;
    private settings: SpeedReaderSettings;
    private displayElement: HTMLDivElement;

    constructor(element: HTMLElement, settings: SpeedReaderSettings) {
        this.element = element;
        this.settings = settings;
        this.text = '';
        this.words = [];
        this.currentIndex = 0;

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

    // Nova metoda za primenu stilova
    public applyStyles() {
        this.displayElement.style.fontFamily = this.settings.fontFamily || 'Arial';
        this.displayElement.style.fontSize = `${this.settings.fontSize || 24}px`;
        this.displayElement.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
        
        // Primeni stilove i na trenutno prikazano slovo ako postoji
        const currentWordEl = this.displayElement.querySelector('.current-word') as HTMLElement;
        if (currentWordEl) {
            currentWordEl.style.color = this.settings.highlightColor || '#ff6b6b';
            currentWordEl.style.fontFamily = this.settings.fontFamily || 'Arial';
            currentWordEl.style.fontSize = `${this.settings.fontSize || 24}px`;
            currentWordEl.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
        }
    }

    // Nova metoda za ažuriranje podešavanja
    public updateSettings(settings: SpeedReaderSettings) {
        this.settings = settings;
        this.applyStyles();
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
            // Primeni stilove i na placeholder
            placeholderEl.style.fontFamily = this.settings.fontFamily || 'Arial';
            placeholderEl.style.fontSize = `${this.settings.fontSize || 24}px`;
            return;
        }

        this.displayElement.empty();
        const wordEl = this.displayElement.createEl('div', { cls: 'current-word' });
        
        if (this.currentIndex < this.words.length) {
            const chunk = [];
            for (let i = 0; i < this.settings.chunkSize && (this.currentIndex + i) < this.words.length; i++) {
                chunk.push(this.words[this.currentIndex + i]);
            }
            wordEl.textContent = chunk.join(' ');
        } else {
            wordEl.textContent = 'Reading complete!';
        }

        // Primeni sve stilove
        wordEl.style.color = this.settings.highlightColor || '#ff6b6b';
        wordEl.style.fontFamily = this.settings.fontFamily || 'Arial';
        wordEl.style.fontSize = `${this.settings.fontSize || 24}px`;
        wordEl.style.letterSpacing = `${this.settings.letterSpacing || 0}px`;
    }
}
