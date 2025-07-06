import { App, Plugin, PluginSettingTab, Setting, TFile, Notice } from 'obsidian';
import { FileHandler } from './fileHandler';
import { SpeedReaderModal } from './speedReaderModal';
import { SpeedReaderSettingTab } from './speedReaderSettingTab';

export interface SpeedReaderSettings {
    wordsPerMinute: number;
    highlightColor: string;
    chunkSize: number;
    autoAdvance: boolean;
    windowState: {
        left: string;
        top: string;
        width: string;
        height: string;
    };
}

const DEFAULT_SETTINGS: SpeedReaderSettings = {
    wordsPerMinute: 250,
    highlightColor: '#ff6b6b',
    chunkSize: 1,
    autoAdvance: true,
    windowState: {
        left: 'auto',
        top: 'auto', 
        width: '800px',
        height: '675px'
    }
};

export default class SpeedReaderPlugin extends Plugin {
    settings!: SpeedReaderSettings;
    fileHandler!: FileHandler;

    async onload() {
        await this.loadSettings();
        
        // Initialize FileHandler
        this.fileHandler = new FileHandler(this.app);

        this.addCommand({
            id: 'open-speed-reader',
            name: 'Open Speed Reader',
            callback: () => {
                new SpeedReaderModal(this.app, this, this.settings).open();
            }
        });

        this.addCommand({
            id: 'speed-read-current-file',
            name: 'Speed Read Current File',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    await this.speedReadFile(activeFile);
                } else {
                    new Notice('No active file to read');
                }
            }
        });

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile && this.fileHandler.isSupportedFile(file)) {
                    menu.addItem((item) => {
                        item
                            .setTitle('Speed Read')
                            .setIcon('zap')
                            .onClick(async () => {
                                await this.speedReadFile(file);
                            });
                    });
                }
            })
        );

        this.addSettingTab(new SpeedReaderSettingTab(this.app, this));
        console.log('Speed Reader plugin loaded');
    }

    async speedReadFile(file: TFile) {
        try {
            const text = await this.fileHandler.readFile(file);

            if (text.trim()) {
                const modal = new SpeedReaderModal(this.app, this, this.settings);
                modal.setText(text);
                modal.open();
            } else {
                new Notice('No text found in file');
            }
        } catch (error) {
            console.error('Error reading file:', error);
            new Notice(`Error reading file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    onunload() {
        console.log('Speed Reader plugin unloaded');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}