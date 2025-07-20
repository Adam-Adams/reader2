import { App, Modal, Notice, Setting } from 'obsidian';
import { SpeedReaderSettings } from '../main';
import { WordSelectorModal } from '../wordSelectorModal';
import { FONT_OPTIONS } from '../fontList';

export interface CommandCallbacks {
    onUpdate: (text: string, words: string[], currentIndex: number) => void;
}

class FontSettingsModal extends Modal {
    private settings: SpeedReaderSettings;
    private onUpdateSettings: (settings: SpeedReaderSettings) => void;
    private closeCallback: (left: string, top: string) => void;

    constructor(
        app: App,
        settings: SpeedReaderSettings,
        onUpdateSettings: (settings: SpeedReaderSettings) => void,
        closeCallback: (left: string, top: string) => void
    ) {
        super(app);
        this.settings = settings;
        this.onUpdateSettings = onUpdateSettings;
        this.closeCallback = closeCallback;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Create draggable header
        const headerEl = contentEl.createDiv('modal-draggable');
        headerEl.createEl('h2', { text: 'Font Settings' });
        this.makeDraggable(headerEl);

        // Font family dropdown
        new Setting(contentEl)
            .setName('Font family')
            .addDropdown(dropdown => {
                // Koristimo zajedničku listu fontova
                for (const [key, value] of Object.entries(FONT_OPTIONS)) {
                    dropdown.addOption(key, value);
                }
                dropdown
                    .setValue(this.settings.fontFamily || 'Arial')
                    .onChange(value => {
                        this.settings.fontFamily = value;
                        this.onUpdateSettings(this.settings);
                    });
            });

        // Font size setting (with slider and text input)
        const fontSizeSetting = new Setting(contentEl)
            .setName('Font size')
            .setDesc('Font size in pixels for displaying text');
            
        let fontSizeSlider: any;
        let fontSizeText: any;
        
        fontSizeSetting
            .addSlider(slider => {
                fontSizeSlider = slider;
                slider
                    .setLimits(12, 72, 2)
                    .setValue(this.settings.fontSize || 24)
                    .setDynamicTooltip()
                    .onChange(value => {
                        this.settings.fontSize = value;
                        if (fontSizeText) {
                            fontSizeText.setValue(value.toString());
                        }
                        this.onUpdateSettings(this.settings);
                    });
            })
            .addText(text => {
                fontSizeText = text;
                text.inputEl.style.width = '50%'; // Postavi širinu na 50%
                text
                    .setPlaceholder('24')
                    .setValue(this.settings.fontSize.toString())
                    .onChange(value => {
                        const num = parseInt(value);
                        if (!isNaN(num) && num >= 12 && num <= 72) {
                            this.settings.fontSize = num;
                            if (fontSizeSlider) {
                                fontSizeSlider.setValue(num);
                            }
                            this.onUpdateSettings(this.settings);
                        }
                    });
            });

        // Letter spacing setting (with slider and text input)
        const letterSpacingSetting = new Setting(contentEl)
            .setName('Letter spacing')
            .setDesc('Horizontal space between letters in pixels');
        
        let letterSpacingSlider: any;
        let letterSpacingText: any;
        
        letterSpacingSetting
            .addSlider(slider => {
                letterSpacingSlider = slider;
                slider
                    .setLimits(-5, 20, 0.5)
                    .setValue(this.settings.letterSpacing || 0)
                    .setDynamicTooltip()
                    .onChange(value => {
                        this.settings.letterSpacing = value;
                        if (letterSpacingText) {
                            letterSpacingText.setValue(value.toString());
                        }
                        this.onUpdateSettings(this.settings);
                    });
            })
            .addText(text => {
                letterSpacingText = text;
                text.inputEl.style.width = '50%'; // Postavi širinu na 50%
                text
                    .setPlaceholder('0')
                    .setValue(this.settings.letterSpacing.toString())
                    .onChange(value => {
                        const num = parseFloat(value);
                        if (!isNaN(num) && num >= -5 && num <= 20) {
                            this.settings.letterSpacing = num;
                            if (letterSpacingSlider) {
                                letterSpacingSlider.setValue(num);
                            }
                            this.onUpdateSettings(this.settings);
                        }
                    });
            });

        // Highlight color setting (with color picker and text input)
        let colorPickerComponent: any;
        let highlightColorText: any;
        
        new Setting(contentEl)
            .setName('Highlight color')
            .setDesc('Color for highlighting the current word')
            .addColorPicker(colorPicker => {
                colorPickerComponent = colorPicker;
                colorPicker
                    .setValue(this.settings.highlightColor || '#ff6b6b')
                    .onChange(value => {
                        this.settings.highlightColor = value;
                        if (highlightColorText) {
                            highlightColorText.setValue(value);
                        }
                        this.onUpdateSettings(this.settings);
                    });
            })
            .addText(text => {
                highlightColorText = text;
                text.inputEl.style.width = '50%'; // Postavi širinu na 50%
                text
                    .setPlaceholder('#ff6b6b')
                    .setValue(this.settings.highlightColor || '#ff6b6b')
                    .onChange(value => {
                        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
                        if (hexRegex.test(value) || value === '') {
                            this.settings.highlightColor = value || '#ff6b6b';
                            if (colorPickerComponent) {
                                colorPickerComponent.setValue(value);
                            }
                            this.onUpdateSettings(this.settings);
                        }
                    });
            });

        // Close button
        new Setting(contentEl)
            .addButton(btn => 
                btn
                    .setButtonText('Close')
                    .onClick(() => {
                        this.close();
                        // Pri zatvaranju prozora bez pomeranja, pošalji trenutne koordinate
                        const left = this.modalEl.style.left;
                        const top = this.modalEl.style.top;
                        if (this.closeCallback) this.closeCallback(left, top);
                    })
            );
    }

    private makeDraggable(handle: HTMLElement) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        
        const modalContent = this.modalEl;
        
        handle.addEventListener('mousedown', (e) => {
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
            
            const newLeft = Math.max(0, Math.min(window.innerWidth - modalContent.offsetWidth, startLeft + deltaX));
            const newTop = Math.max(0, Math.min(window.innerHeight - modalContent.offsetHeight, startTop + deltaY));
            
            modalContent.style.left = newLeft + 'px';
            modalContent.style.top = newTop + 'px';
        };
        
        const handleMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            // Sačuvaj poziciju
            const left = modalContent.style.left;
            const top = modalContent.style.top;
            if (this.closeCallback) this.closeCallback(left, top);
        };
    }
}

export class Commands {
    private controlsElement: HTMLDivElement;
    private settings: SpeedReaderSettings;
    private plugin: any;
    private isPlaying: boolean = false;
    private intervalId: number | null = null;
    private onPlay: () => void;
    private onPause: () => void;
    private onReset: () => void;
    private onSettingsChange: () => void;
    private text: string = '';
    private words: string[] = [];
    private currentIndex: number = 0;
    private callbacks: CommandCallbacks;

    getCurrentIndex(): number {
        return this.currentIndex;
    }

    setCurrentIndex(index: number) {
        if (index >= 0 && index < this.words.length) {
            this.currentIndex = index;
            this.callbacks.onUpdate(this.text, this.words, this.currentIndex);
        }
    }

    constructor(
        container: HTMLElement, 
        settings: SpeedReaderSettings,
        plugin: any,
        onPlay: () => void,
        onPause: () => void,
        onReset: () => void,
        onSettingsChange: () => void,
        callbacks: CommandCallbacks
    ) {
        this.settings = settings;
        this.plugin = plugin;
        this.onPlay = onPlay;
        this.onPause = onPause;
        this.onReset = onReset;
        this.onSettingsChange = onSettingsChange;
        this.callbacks = callbacks;

        // Create controls section
        this.controlsElement = container.createDiv('speed-reader-controls');
        this.createControls();
    }

    private createControls() {
        const playBtn = this.controlsElement.createEl('button', {
            text: 'Play',
            cls: 'speed-reader-btn play-btn'
        });

        const pauseBtn = this.controlsElement.createEl('button', {
            text: 'Pause',
            cls: 'speed-reader-btn pause-btn'
        });

        // Add Skip button
        const skipBtn = this.controlsElement.createEl('button', {
            text: 'Skip',
            cls: 'speed-reader-btn skip-btn'
        });

        const resetBtn = this.controlsElement.createEl('button', {
            text: 'Reset',
            cls: 'speed-reader-btn reset-btn'
        });

        const speedControl = this.controlsElement.createDiv('speed-control');
        speedControl.createEl('label', { text: 'Speed (WPM): ' });
        const speedInput = speedControl.createEl('input', {
            type: 'number',
            value: this.settings.wordsPerMinute.toString(),
            cls: 'speed-input'
        });

        const chunkControl = this.controlsElement.createDiv('chunk-control');
        chunkControl.createEl('label', { text: 'Words: ' });
        const chunkInput = chunkControl.createEl('input', {
            type: 'number',
            value: this.settings.chunkSize.toString(),
            cls: 'chunk-input'
        });
        chunkInput.min = '1';
        chunkInput.max = '50';

        chunkInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.settings.chunkSize = parseInt(target.value) || 1;
            this.plugin.saveSettings();
            this.onSettingsChange();
        });

        // Font settings button
        const fontsBtn = this.controlsElement.createEl('button', {
            text: 'Fonts',
            cls: 'speed-reader-btn fonts-btn'
        });

        fontsBtn.addEventListener('click', () => {
            const modal = new FontSettingsModal(
                this.plugin.app,
                this.settings,
                (newSettings: SpeedReaderSettings) => {
                    // Update current settings
                    Object.assign(this.settings, newSettings);
                    
                    // Save to plugin
                    this.plugin.saveSettings();
                    
                    // Trigger update
                    this.onSettingsChange();
                    
                    // Immediately apply changes to RSVP
                    if (this.callbacks.onUpdate) {
                        this.callbacks.onUpdate(this.text, this.words, this.currentIndex);
                    }
                },
                (left: string, top: string) => {
                    // Sačuvaj poziciju u postavkama
                    if (!this.plugin.settings.fontSettingsPosition) {
                        this.plugin.settings.fontSettingsPosition = {};
                    }
                    this.plugin.settings.fontSettingsPosition.left = left;
                    this.plugin.settings.fontSettingsPosition.top = top;
                    this.plugin.saveSettings();
                }
            );
            
            // Restauracija pozicije ako postoji
            if (this.plugin.settings.fontSettingsPosition) {
                const { left, top } = this.plugin.settings.fontSettingsPosition;
                if (left && top) {
                    modal.modalEl.style.position = 'fixed';
                    modal.modalEl.style.left = left;
                    modal.modalEl.style.top = top;
                    modal.modalEl.style.margin = '0';
                }
            }
            
            modal.open();
        });

        playBtn.addEventListener('click', () => this.play());
        pauseBtn.addEventListener('click', () => this.pause());
        skipBtn.addEventListener('click', () => {
            if (this.words.length === 0) {
                new Notice('No text loaded. Please load text first.');
                return;
            }
            this.pause();
            
            // Open word selector modal with proper settings
            new WordSelectorModal(
                this.plugin.app,
                this.text,
                this.words,
                this.currentIndex,
                (index: number) => {
                    this.currentIndex = index;
                    this.callbacks.onUpdate(this.text, this.words, this.currentIndex);
                },
                this.plugin, // Pass plugin reference
                this.settings // Fixed property name
            ).open();
        });
        resetBtn.addEventListener('click', () => this.reset());
        speedInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            this.settings.wordsPerMinute = parseInt(target.value) || 250;
            this.plugin.saveSettings();
            this.onSettingsChange();
        });
    }

    setPlayButtonState(disabled: boolean) {
        const playBtn = this.controlsElement.querySelector('.play-btn') as HTMLButtonElement;
        if (playBtn) playBtn.disabled = disabled;
    }

    getIsPlaying(): boolean {
        return this.isPlaying;
    }

    setContent(text: string, words: string[]) {
        this.text = text;
        this.words = words;
        this.currentIndex = 0;
        this.callbacks.onUpdate(this.text, this.words, this.currentIndex);
    }

    play() {
        if (this.words.length === 0) {
            new Notice('No text to read');
            return;
        }

        if (this.isPlaying) {
            return;
        }

        this.setPlayButtonState(true);
        this.isPlaying = true;
        const interval = (60000 / this.settings.wordsPerMinute) * this.settings.chunkSize;

        this.intervalId = window.setInterval(() => {
            if (this.currentIndex >= this.words.length) {
                this.pause();
                new Notice('Reading complete!');
                return;
            }

            this.currentIndex += this.settings.chunkSize;
            this.callbacks.onUpdate(this.text, this.words, this.currentIndex);
        }, interval);

        // Notify that play has started
        this.onPlay();
    }

    pause() {
        this.setPlayButtonState(false);
        this.isPlaying = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        // Notify that pause has occurred
        this.onPause();
    }

    reset() {
        this.setPlayButtonState(false);
        this.pause();
        this.currentIndex = 0;
        this.callbacks.onUpdate(this.text, this.words, this.currentIndex);
        // Notify that reset has occurred
        this.onReset();
    }
}
