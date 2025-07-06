import { App, PluginSettingTab, Setting } from 'obsidian';
import { SpeedReaderSettings } from './main';

export class SpeedReaderSettingTab extends PluginSettingTab {
    plugin: any; // SpeedReaderPlugin type

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Speed Reader Settings' });

        new Setting(containerEl)
            .setName('Words per minute')
            .setDesc('Reading speed in words per minute')
            .addText(text => text
                .setPlaceholder('250')
                .setValue(this.plugin.settings.wordsPerMinute.toString())
                .onChange(async (value) => {
                    this.plugin.settings.wordsPerMinute = parseInt(value) || 250;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Highlight color')
            .setDesc('Color for highlighting the current word')
            .addText(text => text
                .setPlaceholder('#ff6b6b')
                .setValue(this.plugin.settings.highlightColor)
                .onChange(async (value) => {
                    this.plugin.settings.highlightColor = value || '#ff6b6b';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Chunk size')
            .setDesc('Number of words to display at once')
            .addText(text => text
                .setPlaceholder('1')
                .setValue(this.plugin.settings.chunkSize.toString())
                .onChange(async (value) => {
                    this.plugin.settings.chunkSize = parseInt(value) || 1;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto advance')
            .setDesc('Automatically advance to next word')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoAdvance)
                .onChange(async (value) => {
                    this.plugin.settings.autoAdvance = value;
                    await this.plugin.saveSettings();
                }));
    }
}