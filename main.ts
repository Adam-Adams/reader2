import { App, Plugin, PluginSettingTab, Setting, TFile, Notice } from 'obsidian';
import { FileHandler } from './fileHandler';
import { SpeedReaderModal } from './speedReaderModal';
import { SpeedReaderSettingTab } from './speedReaderSettingTab';
import { TextInputModalSettings } from './textInputModal';
import { FileSelectionModalSettings } from './fileSelectionModal';
import { WordSelectorModalSettings } from './wordSelectorModal';
import { replaceFontPaths } from './fontList';  // Dodajemo import

export interface SpeedReaderSettings {
    wordsPerMinute: number;
    highlightColor: string;
    chunkSize: number;
    autoAdvance: boolean;
    fontFamily: string;
    fontSize: number;
    letterSpacing: number;  // Dodato novo polje
    windowState: {
        left: string;
        top: string;
        width: string;
        height: string;
    };
    textInputModalSettings?: TextInputModalSettings;
    fileSelectionModalSettings?: FileSelectionModalSettings;
    wordSelectorModalSettings?: WordSelectorModalSettings;
    wordSelectorWindowState?: {
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
    fontFamily: 'Arial',
    fontSize: 24,
    letterSpacing: 0,  // Podrazumevana vrednost
    windowState: {
        left: 'auto',
        top: 'auto', 
        width: '800px',
        height: '675px'
    },
    textInputModalSettings: {
        windowState: {
            left: 'auto',
            top: 'auto',
            width: '500px',
            height: '400px'
        }
    },
    fileSelectionModalSettings: {
        windowState: {
            left: 'auto',
            top: 'auto',
            width: '600px',
            height: '500px'
        }
    },
    wordSelectorModalSettings: {
        windowState: {
            left: 'auto',
            top: 'auto',
            width: '600px',
            height: '500px'
        }
    },
    wordSelectorWindowState: {
        left: 'auto',
        top: 'auto',
        width: '600px',
        height: '500px'
    }
};

export default class SpeedReaderPlugin extends Plugin {
    settings!: SpeedReaderSettings;
    modal: SpeedReaderModal | null = null;
    fileHandler!: FileHandler;
    private fontsLinkElement: HTMLLinkElement | null = null;

    async onload() {
        await this.loadSettings();
        
        // Initialize FileHandler
        this.fileHandler = new FileHandler(this.app);

        // Učitaj fontove
        await this.loadFonts();

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

    // Učitaj fontove kao inline CSS sa apsolutnim putanjama
    private async loadFonts() {
        try {
            // Ukloni postojeći stil ako postoji
            const existingStyle = document.getElementById('speed-reader-fonts');
            if (existingStyle) existingStyle.remove();

            // Pročitaj sadržaj font.css fajla iz plugin direktorijuma
            const cssPath = `${this.manifest.dir}/font.css`;
            let cssContent = await this.app.vault.adapter.read(cssPath);
            
            // Zameni relativne putanje fontova sa apsolutnim koristeći funkciju iz fontList.ts
            cssContent = replaceFontPaths(cssContent, this.manifest, this.app);

            // Kreiraj novi style element
            const style = document.createElement('style');
            style.id = 'speed-reader-fonts';
            style.textContent = cssContent;
            document.head.appendChild(style);

            console.log('Speed Reader fonts loaded successfully with absolute paths');
        } catch (error) {
            console.error('Error loading Speed Reader fonts:', error);
        }
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

    openSpeedReader() {
        this.modal = new SpeedReaderModal(this.app, this, this.settings);
        this.modal.open();
    }

    onunload() {
        if (this.modal) {
            this.modal.close();
            this.modal = null;
        }
        
        console.log('Speed Reader plugin unloaded');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
