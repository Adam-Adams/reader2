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
    activeTextColor?: string;
    inactiveTextColor?: string;
    chunkSize: number;
    autoAdvance: boolean;
    fontFamily: string;
    fontSize: number;
    letterSpacing: number;
    readerType: 'rsvp' | 'linear' | 'wholeLine' | 'splitLine' | 'threeSplitLine' | 'focus'; // Added focus option

    // RSVP settings
    rsvp?: {
        displayMode: 'single-line' | 'multi-line' | 'ellipse';
        singleLine?: {
            wordsPerLine: number;
        };
        multiLine?: {
            rows: number;
            width: number;
        };
        ellipse?: {
            width: number;
            height: number;
        };
    };
    // Linear reader settings
    linear?: {
        displayMode: 'normal' | 'words';
        words?: {
            chunkSize: number;
            width?: number;
            height?: number;
        };
        normal?: {
            width?: number;
            height?: number;
            manualScroll?: boolean;
        };
    };
    // WholeLine reader settings
    wholeLine?: {
        displayMode: 'WholeLine' | 'SingleLetter';
        singleLetter?: {
            chunkSize: number;
            width?: number;
            height?: number;
        };
        wholeLine?: {
            width?: number;
            height?: number;
        };
    };
    // SplitLine reader settings
    splitLine?: {
        displayMode: 'SplitLine' | 'SplitLetter';
        splitLetter?: {
            chunkSize: number;
            width?: number;
            height?: number;
        };
        splitLine?: {
            width?: number;
            height?: number;
        };
    };
        // ThreeSplitLine reader settings
    threeSplitLine?: {
        displayMode: 'ThreeSplitLine' | 'ThreeSplitLetter';
        threeSplitLetter?: {
            chunkSize: number;
            width?: number;
            height?: number;
        };
        threeSplitLine?: {
            width?: number;
            height?: number;
        };
    };
        // Focus reader settings
    focus?: {
        displayMode: 'Margin' | 'Fixation';
        fixation?: {
            chunkSize: number;
            width?: number;
            height?: number;
        };
        margin?: {
            percentage?: number;
            width?: number;
            height?: number;
        };
    };
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
    fontSettingsPosition?: {
        left: string;
        top: string;
    };
}

const DEFAULT_SETTINGS: SpeedReaderSettings = {
    wordsPerMinute: 250,
    highlightColor: '#ff6b6b',
    chunkSize: 1,
    autoAdvance: true,
    fontFamily: 'Arial',
    fontSize: 24,
    letterSpacing: 0,
    readerType: 'rsvp',
    // RSVP settings
    rsvp: {
        displayMode: 'ellipse',
        singleLine: {
            wordsPerLine: 8
        },
        multiLine: {
            rows: 3,
            width: 400
        },
        ellipse: {
            width: 300,
            height: 200
        }
    },
    // Linear reader settings
    linear: {
        displayMode: 'normal',
        words: {
            chunkSize: 1,
            width: 600,
            height: 300
        },
        normal: {
            width: 600,
            height: 300
        }
    },
    // WholeLine reader settings
    wholeLine: {
        displayMode: 'WholeLine',
        singleLetter: {
            chunkSize: 3,
            width: 600,
            height: 300
        },
        wholeLine: {
            width: 600,
            height: 300
        }
    },
    // SplitLine reader settings
    splitLine: {
        displayMode: 'SplitLine',
        splitLetter: {
            chunkSize: 3,
            width: 600,
            height: 300
        },
        splitLine: {
            width: 600,
            height: 300
        }
    },
        // ThreeSplitLine reader settings
    threeSplitLine: {
        displayMode: 'ThreeSplitLine',
        threeSplitLetter: {
            chunkSize: 3,
            width: 600,
            height: 300
        },
        threeSplitLine: {
            width: 600,
            height: 300
        }
    },
        // Focus reader settings
    focus: {
        displayMode: 'Margin',
        fixation: {
            chunkSize: 1,
            width: 600,
            height: 300
        },
        margin: {
            percentage: 10,
            width: 600,
            height: 300
        }
    },
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
    },
    fontSettingsPosition: {
        left: 'auto',
        top: 'auto'
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

        // Dodaj ikonu na ribbon
        const ribbonIcon = this.addRibbonIcon('book-open-text', 'Speed Reader', (evt: MouseEvent) => {
            if (evt.button === 0) { // Levi klik
                new SpeedReaderModal(this.app, this, this.settings).open();
            } else if (evt.button === 2) { // Desni klik
                this.showContextMenu(evt);
            }
        });
        
                //Bodoni MT<text style="fill: currentColor; font-family: Arial, sans-serif; font-size: 10px; font-weight: light;" x="10" y="21">SR</text>
        // Zameni ikonu sa custom SVG
        const iconElement = ribbonIcon.querySelector('svg');
        if (iconElement) {
            iconElement.innerHTML = `
                <path d="M 12 7 L 12.051 10.236"/>
                <path d="M16 8h2"/>
                <path d="M 22.041 4 C 21.336 5.871 21.532 10.675 21.611 10.623 M 5.975 18.051 L 3 18 C 2.448 18 2 17.552 2 17 C 2.838 14.607 3.247 6.836 2 4 C 2 3.448 2.448 3 3 3 L 8 3 C 10.209 3 12 4.791 12 7 C 12 4.791 13.791 3 16 3 L 21 3 C 21.552 3 22 3.448 22 4"/>
                <path d="M6 12h2"/>
                <path d="M6 8h2"/>
                <text style="fill: currentColor; font-family: Arial, sans-serif; font-size: 32px; transform-box: fill-box; transform-origin: 20.6783px 17.5102px;" transform="matrix(0.333542, 0, 0, 0.345895, -6.365406, 6.662428)" x="1" y="23">SR</text>
            `;
        }

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

    private showContextMenu(evt: MouseEvent) {
        // Spreči podrazumevani kontekst meni
        evt.preventDefault();
        
        // Koristi Obsidian's Menu API preko plugin konteksta
        const Menu = (this.app as any).Menu;
        if (!Menu) {
            // Fallback na custom meni ako Menu nije dostupan
            this.showCustomContextMenu(evt);
            return;
        }
        
        const menu = new Menu(this.app);
        
        menu.addItem((item: any) => {
            item.setTitle('Open Speed Reader')
                .setIcon('book-open-text')
                .onClick(() => {
                    new SpeedReaderModal(this.app, this, this.settings).open();
                });
        });
        
        menu.addItem((item: any) => {
            item.setTitle('Speed Read Current File')
                .setIcon('file-text')
                .onClick(async () => {
                    const activeFile = this.app.workspace.getActiveFile();
                    if (activeFile) {
                        await this.speedReadFile(activeFile);
                    } else {
                        new Notice('No active file to read');
                    }
                });
        });
        
        menu.addItem((item: any) => {
            item.setTitle('Settings')
                .setIcon('settings')
                .onClick(() => {
                    // @ts-ignore - Obsidian API
                    this.app.setting.open();
                    // @ts-ignore - Obsidian API
                    setTimeout(() => this.app.setting.openTabById('speed-reader'), 100);
                });
        });
        
        // Prikaži meni na poziciji miša
        menu.showAtMouseEvent(evt);
    }

    private showCustomContextMenu(evt: MouseEvent) {
        // Fallback custom meni kada Obsidian Menu nije dostupan
        evt.preventDefault();
        
        const contextMenu = document.createElement('div');
        contextMenu.className = 'speed-reader-context-menu';
        contextMenu.style.position = 'fixed';
        contextMenu.style.left = evt.clientX + 'px';
        contextMenu.style.top = evt.clientY + 'px';
        contextMenu.style.background = 'var(--background-primary)';
        contextMenu.style.border = '1px solid var(--background-modifier-border)';
        contextMenu.style.borderRadius = '4px';
        contextMenu.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
        contextMenu.style.zIndex = '1000';
        contextMenu.style.minWidth = '200px';
        
        // Dodaj stilove
        const style = document.createElement('style');
        style.textContent = `
            .speed-reader-context-menu .menu-item {
                padding: 8px 12px;
                cursor: pointer;
                font-size: 14px;
                color: var(--text-normal);
                border-bottom: 1px solid var(--background-modifier-border);
            }
            .speed-reader-context-menu .menu-item:last-child {
                border-bottom: none;
            }
            .speed-reader-context-menu .menu-item:hover {
                background: var(--background-secondary);
            }
        `;
        document.head.appendChild(style);
        
        // Dodaj opcije menija
        const commands = [
            { title: 'Open Speed Reader', action: () => new SpeedReaderModal(this.app, this, this.settings).open() },
            { title: 'Speed Read Current File', action: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    await this.speedReadFile(activeFile);
                } else {
                    new Notice('No active file to read');
                }
            }},
            { title: 'Settings', action: () => {
                // @ts-ignore - Obsidian API
                this.app.setting.open();
                // @ts-ignore - Obsidian API
                setTimeout(() => this.app.setting.openTabById('speed-reader'), 100);
            }}
        ];
        
        commands.forEach(cmd => {
            const item = document.createElement('div');
            item.className = 'menu-item';
            item.textContent = cmd.title;
            item.addEventListener('click', () => {
                cmd.action();
                document.body.removeChild(contextMenu);
                document.head.removeChild(style);
            });
            contextMenu.appendChild(item);
        });
        
        // Dodaj meni u DOM
        document.body.appendChild(contextMenu);
        
        // Zatvori meni kada se klikne negde drugde
        const closeMenu = (e: MouseEvent) => {
            if (!contextMenu.contains(e.target as Node)) {
                // Bezbedno ukloni contextMenu samo ako postoji u body-u
                if (contextMenu.parentNode === document.body) {
                    try {
                        document.body.removeChild(contextMenu);
                    } catch (e) {
                        console.error('Error removing context menu:', e);
                    }
                }
                
                // Bezbedno ukloni style samo ako postoji u head-u
                if (style && style.parentNode === document.head) {
                    try {
                        document.head.removeChild(style);
                    } catch (e) {
                        console.error('Error removing style:', e);
                    }
                }
                
                // Ukloni event listener
                document.removeEventListener('click', closeMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);
    }
}
