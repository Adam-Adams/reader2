import { SpeedReaderSettings } from '../main';

export class MiniPreview {
    private container: HTMLElement;
    private content: HTMLElement;
    private settings: SpeedReaderSettings;

    constructor(container: HTMLElement, text: string, words: string[], currentIndex: number, settings: SpeedReaderSettings) {
        this.container = container;
        this.settings = settings;
        
        // Kreiraj element za sadržaj unutar containera
        this.content = this.container.createDiv({
            cls: 'mini-preview-content'
        });
        
        // Inicijalno ažuriranje
        this.update(text, words, currentIndex);
    }

    update(text: string, words: string[], currentIndex: number) {
        if (!text || !words.length) return;
        
        // Očisti prethodni sadržaj
        this.content.empty();
        
        // Kreiraj container za preview sadržaj
        const previewContent = this.content.createDiv({ cls: 'preview-content' });

        // Broj reči koje se prikazuju u RSVP
        const rsvpChunkSize = this.settings.chunkSize || 1;
        const startIndex = currentIndex;
        const endIndex = Math.min(startIndex + rsvpChunkSize, words.length);

        // Tekst pre trenutnih reči
        if (startIndex > 0) {
            previewContent.createDiv({
                cls: 'preview-before',
                text: words.slice(0, startIndex).join(' ')
            });
        }

        // Trenutne reči (chunk)
        if (startIndex < words.length) {
            previewContent.createDiv({
                cls: 'preview-current',
                text: words.slice(startIndex, endIndex).join(' ')
            });
        }

        // Tekst posle trenutnih reči
        if (endIndex < words.length) {
            previewContent.createDiv({
                cls: 'preview-after',
                text: words.slice(endIndex).join(' ')
            });
        }
    }
}
