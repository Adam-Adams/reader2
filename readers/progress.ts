export class Progress {
    private element: HTMLElement;
    private progressFill: HTMLElement;

    constructor(container: HTMLElement) {
        this.element = container.createDiv('speed-reader-progress');
        const progressBar = this.element.createEl('div', { cls: 'progress-bar' });
        this.progressFill = progressBar.createEl('div', { cls: 'progress-fill' });
    }

    update(currentIndex: number, totalWords: number) {
        if (totalWords === 0) {
            this.progressFill.style.width = '0%';
            return;
        }

        // Use Math.min to ensure progress doesn't exceed 100%
        const progress = Math.min(100, (currentIndex / totalWords) * 100);
        this.progressFill.style.width = `${progress}%`;
        
        // Add transition for smooth animation
        this.progressFill.style.transition = 'width 0.1s ease-out';
    }
}
