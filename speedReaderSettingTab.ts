import { App, PluginSettingTab, Setting } from 'obsidian';
import { SpeedReaderSettings } from './main';
import { FONT_OPTIONS } from './fontList';

export class SpeedReaderSettingTab extends PluginSettingTab {
    plugin: any; // SpeedReaderPlugin type

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private async updateModalSettings() {
        await this.plugin.saveSettings();

        // Speed-reader modal
        if (this.plugin.modal?.updateSettings) {
            this.plugin.modal.updateSettings(this.plugin.settings);
        }

        // Text-input modal (if open)
        if (this.plugin.textInputModal?.updateSettings) {
            this.plugin.textInputModal.updateSettings(this.plugin.settings);
        }

        // Word-selector modal (if open)
        if (this.plugin.wordSelectorModal?.updateSettings) {
            this.plugin.wordSelectorModal.updateSettings(this.plugin.settings);
        }
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Speed Reader Settings' });

        new Setting(containerEl)
            .setName('Words per minute')
            .setDesc('Reading speed in words per minute')
            .addText(text =>
                text
                    .setPlaceholder('250')
                    .setValue(this.plugin.settings.wordsPerMinute.toString())
                    .onChange(async (value) => {
                        this.plugin.settings.wordsPerMinute = parseInt(value) || 250;
                        await this.updateModalSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Font family')
            .setDesc('Font family for displaying text')
            .addDropdown(dropdown => {
                // Dodajemo sve custom fontove iz zajedničke liste
                for (const [key, value] of Object.entries(FONT_OPTIONS)) {
                    dropdown.addOption(key, value);
                }
                dropdown
                    .setValue(this.plugin.settings.fontFamily || 'Arial')
                    .onChange(async (value) => {
                        this.plugin.settings.fontFamily = value;
                        await this.updateModalSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Font size')
            .setDesc('Font size in pixels for displaying text')
            .addSlider(slider =>
                slider
                    .setLimits(12, 72, 2)
                    .setValue(this.plugin.settings.fontSize || 24)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.fontSize = value;
                        await this.updateModalSettings();
                    }),
            )
            .addText(text =>
                text
                    .setPlaceholder('24')
                    .setValue(this.plugin.settings.fontSize.toString())
                    .onChange(async (value) => {
                        const num = parseInt(value);
                        if (!isNaN(num) && num >= 12 && num <= 72) {
                            this.plugin.settings.fontSize = num;
                            await this.updateModalSettings();
                        }
                    }),
            );

        // Povežite klizač i tekst komponentu za sinhronizaciju
        const letterSpacingSetting = new Setting(containerEl)
            .setName('Letter spacing')
            .setDesc('Horizontal space between letters in pixels');
        
        let sliderComponent: any;
        let textComponent: any;
        
        letterSpacingSetting
            .addSlider(slider => {
                sliderComponent = slider;
                slider
                    .setLimits(-5, 20, 0.5)
                    .setValue(this.plugin.settings.letterSpacing || 0)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.letterSpacing = value;
                        if (textComponent) {
                            textComponent.setValue(value.toString());
                        }
                        await this.updateModalSettings();
                    });
            })
            .addText(text => {
                textComponent = text;
                text
                    .setPlaceholder('0')
                    .setValue(this.plugin.settings.letterSpacing.toString())
                    .onChange(async (value) => {
                        const num = parseFloat(value);
                        if (!isNaN(num) && num >= -5 && num <= 20) {
                            this.plugin.settings.letterSpacing = num;
                            if (sliderComponent) {
                                sliderComponent.setValue(num);
                            }
                            await this.updateModalSettings();
                        }
                    });
            });

        new Setting(containerEl)
            .setName('Highlight color')
            .setDesc('Color for highlighting the current word')
            .addColorPicker(color =>
                color.setValue(this.plugin.settings.highlightColor || '#ff6b6b').onChange(async (value) => {
                    this.plugin.settings.highlightColor = value;
                    await this.updateModalSettings();
                }),
            )
            .addText(text =>
                text
                    .setPlaceholder('#ff6b6b')
                    .setValue(this.plugin.settings.highlightColor || '#ff6b6b')
                    .onChange(async (value) => {
                        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
                        if (hexRegex.test(value) || value === '') {
                            this.plugin.settings.highlightColor = value || '#ff6b6b';
                            await this.updateModalSettings();
                        }
                    }),
            );

        new Setting(containerEl)
            .setName('Chunk size')
            .setDesc('Number of words to display at once')
            .addText(text =>
                text
                    .setPlaceholder('1')
                    .setValue(this.plugin.settings.chunkSize.toString())
                    .onChange(async (value) => {
                        this.plugin.settings.chunkSize = parseInt(value) || 1;
                        await this.updateModalSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Auto advance')
            .setDesc('Automatically advance to next word')
            .addToggle(toggle =>
                toggle.setValue(this.plugin.settings.autoAdvance).onChange(async (value) => {
                    this.plugin.settings.autoAdvance = value;
                    await this.updateModalSettings();
                }),
            );
    }
}
