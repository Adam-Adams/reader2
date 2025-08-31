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
        containerEl.createEl('h3', { text: 'Speed Reader Settings' });

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
            .setDesc('Color for highlighting the current word or letter')
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
        // Add Active text color setting
        new Setting(containerEl)
            .setName('Active text color')
            .setDesc('Color for the currently focused word')
            .addColorPicker(color =>
                color.setValue(this.plugin.settings.activeTextColor || '').onChange(async (value) => {
                    this.plugin.settings.activeTextColor = value;
                    await this.updateModalSettings();
                }),
            )
            .addText(text =>
                text
                    .setPlaceholder('Use theme default')
                    .setValue(this.plugin.settings.activeTextColor || '')
                    .onChange(async (value) => {
                        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
                        if (hexRegex.test(value) || value === '') {
                            this.plugin.settings.activeTextColor = value;
                            await this.updateModalSettings();
                        }
                    }),
            );

        // Add Inactive text color setting
        new Setting(containerEl)
            .setName('Inactive text color')
            .setDesc('Color for non-focused words')
            .addColorPicker(color =>
                color.setValue(this.plugin.settings.inactiveTextColor || '').onChange(async (value) => {
                    this.plugin.settings.inactiveTextColor = value;
                    await this.updateModalSettings();
                }),
            )
            .addText(text =>
                text
                    .setPlaceholder('Use theme default')
                    .setValue(this.plugin.settings.inactiveTextColor || '')
                    .onChange(async (value) => {
                        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
                        if (hexRegex.test(value) || value === '') {
                            this.plugin.settings.inactiveTextColor = value;
                            await this.updateModalSettings();
                        }
                    }),
            );

        // Chunk size setting sa objašnjenjem po modovima
        const displayMode = this.plugin.settings.rsvp?.displayMode || 'ellipse';
        let chunkDescription = 'Number of words to display at once';
        
        if (displayMode === 'single-line') {
            chunkDescription = 'Number of words to display at once (fixed chunk size in single-line mode)';
        } else if (displayMode === 'multi-line' || displayMode === 'ellipse') {
            chunkDescription = 'Starting chunk size (automatically adjusted based on display area)';
        }

        new Setting(containerEl)
            .setName('Chunk size')
            .setDesc(chunkDescription)
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

        // Reader Display Settings section
        containerEl.createEl('h3', { text: 'Reader Display Settings' });

        new Setting(containerEl)
            .setName('Reader type')
            .setDesc('Choose reading mode')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('rsvp', 'RSVP')
                    .addOption('linear', 'Linear')
                    .addOption('wholeLine', 'WholeLine')
                    .addOption('splitLine', 'SplitLine')
                    .addOption('threeSplitLine', 'ThreeSplitLine') // Added ThreeSplitLine option
                    .setValue(this.plugin.settings.readerType || 'rsvp')
                    .onChange(async (value) => {
                        this.plugin.settings.readerType = value as 'rsvp' | 'linear' | 'wholeLine' | 'splitLine' | 'threeSplitLine';
                        // Reset display mode when changing reader type
                        if (value === 'linear') {
                            this.plugin.settings.rsvp = undefined;
                        } else if (value === 'wholeLine') {
                            this.plugin.settings.rsvp = undefined;
                            this.plugin.settings.linear = undefined;
                        } else if (value === 'splitLine') {
                            this.plugin.settings.rsvp = undefined;
                            this.plugin.settings.linear = undefined;
                            this.plugin.settings.wholeLine = undefined;
                        } else if (value === 'threeSplitLine') {
                            this.plugin.settings.rsvp = undefined;
                            this.plugin.settings.linear = undefined;
                            this.plugin.settings.wholeLine = undefined;
                            this.plugin.settings.splitLine = undefined;
                        } else {
                            if (!this.plugin.settings.rsvp) {
                                this.plugin.settings.rsvp = { displayMode: 'ellipse' };
                            }
                        }
                        await this.updateModalSettings();
                        this.display(); // Refresh settings UI
                    })
            );

        // Reader Display Settings (shown based on reader type)
        if (this.plugin.settings.readerType === 'rsvp') {
            new Setting(containerEl)
                .setName('RSVP display mode')
                .setDesc('Choose how text is displayed in RSVP mode')
                .addDropdown(dropdown =>
                    dropdown
                        .addOption('single-line', 'Single line')
                        .addOption('multi-line', 'Multi-line rectangle')
                        .addOption('ellipse', 'Ellipse')
                    .setValue(this.plugin.settings.rsvp?.displayMode || 'ellipse')
                    .onChange(async (value) => {
                        if (!this.plugin.settings.rsvp) {
                            this.plugin.settings.rsvp = {};
                        }
                        this.plugin.settings.rsvp.displayMode = value as 'single-line' | 'multi-line' | 'ellipse';
                        
                        // Update chunk size when switching to single-line mode
                        if (value === 'single-line') {
                            this.plugin.settings.chunkSize = 
                                this.plugin.settings.rsvp.singleLine?.wordsPerLine || 8;
                        }
                        
                        await this.updateModalSettings();
                        this.display(); // Refresh to show/hide relevant options
                    }),
            );
        } else if (this.plugin.settings.readerType === 'linear') {
            // Linear display mode settings
            new Setting(containerEl)
                .setName('Linear display mode')
                .setDesc('Choose how text is displayed in Linear mode')
                .addDropdown(dropdown =>
                    dropdown
                        .addOption('normal', 'Normal')
                        .addOption('words', 'Words')
                        .setValue(this.plugin.settings.linear?.displayMode || 'words')
                        .onChange(async (value) => {
                            if (!this.plugin.settings.linear) {
                                this.plugin.settings.linear = {};
                            }
                            this.plugin.settings.linear.displayMode = value as 'normal' | 'words';
                            await this.updateModalSettings();
                            this.display(); // Refresh to show/hide relevant options
                        }),
                );

            // Words mode settings
            if (this.plugin.settings.linear?.displayMode === 'words') {
                new Setting(containerEl)
                    .setName('Words chunk size')
                    .setDesc('Number of words to display at once')
                    .addText(text =>
                        text
                            .setPlaceholder('1')
                            .setValue((this.plugin.settings.linear?.words?.chunkSize || 1).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 1 && num <= 10) {
                                    if (!this.plugin.settings.linear) this.plugin.settings.linear = {};
                                    if (!this.plugin.settings.linear.words) this.plugin.settings.linear.words = {};
                                    this.plugin.settings.linear.words.chunkSize = num;
                                    this.plugin.settings.chunkSize = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );

                new Setting(containerEl)
                    .setName('Words width')
                    .setDesc('Width of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('600')
                            .setValue((this.plugin.settings.linear?.words?.width || 600).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 200 && num <= 800) {
                                    if (!this.plugin.settings.linear) this.plugin.settings.linear = {};
                                    if (!this.plugin.settings.linear.words) this.plugin.settings.linear.words = {};
                                    this.plugin.settings.linear.words.width = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );

                new Setting(containerEl)
                    .setName('Words height')
                    .setDesc('Height of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('300')
                            .setValue((this.plugin.settings.linear?.words?.height || 300).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 100 && num <= 400) {
                                    if (!this.plugin.settings.linear) this.plugin.settings.linear = {};
                                    if (!this.plugin.settings.linear.words) this.plugin.settings.linear.words = {};
                                    this.plugin.settings.linear.words.height = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );
            }

            // Normal mode settings
            if (this.plugin.settings.linear?.displayMode === 'normal') {
                new Setting(containerEl)
                    .setName('Normal width')
                    .setDesc('Width of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('600')
                            .setValue((this.plugin.settings.linear?.normal?.width || 600).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 200 && num <= 800) {
                                    if (!this.plugin.settings.linear) this.plugin.settings.linear = {};
                                    if (!this.plugin.settings.linear.normal) this.plugin.settings.linear.normal = {};
                                    this.plugin.settings.linear.normal.width = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );

                new Setting(containerEl)
                    .setName('Normal height')
                    .setDesc('Height of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('300')
                            .setValue((this.plugin.settings.linear?.normal?.height || 300).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 100 && num <= 400) {
                                    if (!this.plugin.settings.linear) this.plugin.settings.linear = {};
                                    if (!this.plugin.settings.linear.normal) this.plugin.settings.linear.normal = {};
                                    this.plugin.settings.linear.normal.height = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );
            }
        } else if (this.plugin.settings.readerType === 'wholeLine') {
            // WholeLine display mode settings
            new Setting(containerEl)
                .setName('WholeLine display mode')
                .setDesc('Choose how text is displayed in WholeLine mode')
                .addDropdown(dropdown =>
                    dropdown
                        .addOption('WholeLine', 'Whole Line')
                        .addOption('SingleLetter', 'Single Letter')
                        .setValue(this.plugin.settings.wholeLine?.displayMode || 'WholeLine')
                        .onChange(async (value) => {
                            if (!this.plugin.settings.wholeLine) {
                                this.plugin.settings.wholeLine = {};
                            }
                            this.plugin.settings.wholeLine.displayMode = value as 'WholeLine' | 'SingleLetter';
                            await this.updateModalSettings();
                            this.display(); // Refresh to show/hide relevant options
                        }),
                );

            // SingleLetter mode settings
            if (this.plugin.settings.wholeLine?.displayMode === 'SingleLetter') {
                new Setting(containerEl)
                    .setName('SingleLetter width')
                    .setDesc('Width of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('600')
                            .setValue((this.plugin.settings.wholeLine?.singleLetter?.width || 600).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 200 && num <= 800) {
                                    if (!this.plugin.settings.wholeLine) this.plugin.settings.wholeLine = {};
                                    if (!this.plugin.settings.wholeLine.singleLetter) this.plugin.settings.wholeLine.singleLetter = {};
                                    this.plugin.settings.wholeLine.singleLetter.width = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );

                new Setting(containerEl)
                    .setName('SingleLetter height')
                    .setDesc('Height of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('300')
                            .setValue((this.plugin.settings.wholeLine?.singleLetter?.height || 300).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 100 && num <= 400) {
                                    if (!this.plugin.settings.wholeLine) this.plugin.settings.wholeLine = {};
                                    if (!this.plugin.settings.wholeLine.singleLetter) this.plugin.settings.wholeLine.singleLetter = {};
                                    this.plugin.settings.wholeLine.singleLetter.height = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );
            }

            // WholeLine mode settings
            if (this.plugin.settings.wholeLine?.displayMode === 'WholeLine') {
                new Setting(containerEl)
                    .setName('WholeLine width')
                    .setDesc('Width of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('600')
                            .setValue((this.plugin.settings.wholeLine?.wholeLine?.width || 600).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 200 && num <= 800) {
                                    if (!this.plugin.settings.wholeLine) this.plugin.settings.wholeLine = {};
                                    if (!this.plugin.settings.wholeLine.wholeLine) this.plugin.settings.wholeLine.wholeLine = {};
                                    this.plugin.settings.wholeLine.wholeLine.width = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );

                new Setting(containerEl)
                    .setName('WholeLine height')
                    .setDesc('Height of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('300')
                            .setValue((this.plugin.settings.wholeLine?.wholeLine?.height || 300).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 100 && num <= 400) {
                                    if (!this.plugin.settings.wholeLine) this.plugin.settings.wholeLine = {};
                                    if (!this.plugin.settings.wholeLine.wholeLine) this.plugin.settings.wholeLine.wholeLine = {};
                                    this.plugin.settings.wholeLine.wholeLine.height = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );
            }
        } else if (this.plugin.settings.readerType === 'splitLine') {
            // SplitLine display mode settings
            new Setting(containerEl)
                .setName('SplitLine display mode')
                .setDesc('Choose how text is displayed in SplitLine mode')
                .addDropdown(dropdown =>
                    dropdown
                        .addOption('SplitLine', 'Split Line')
                        .addOption('SplitLetter', 'Split Letter')
                        .setValue(this.plugin.settings.splitLine?.displayMode || 'SplitLine')
                        .onChange(async (value) => {
                            if (!this.plugin.settings.splitLine) {
                                this.plugin.settings.splitLine = {};
                            }
                            this.plugin.settings.splitLine.displayMode = value as 'SplitLine' | 'SplitLetter';
                            await this.updateModalSettings();
                            this.display(); // Refresh to show/hide relevant options
                        }),
                );

            // SplitLetter mode settings
            if (this.plugin.settings.splitLine?.displayMode === 'SplitLetter') {
                new Setting(containerEl)
                    .setName('SplitLetter width')
                    .setDesc('Width of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('600')
                            .setValue((this.plugin.settings.splitLine?.splitLetter?.width || 600).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 200 && num <= 800) {
                                    if (!this.plugin.settings.splitLine) this.plugin.settings.splitLine = {};
                                    if (!this.plugin.settings.splitLine.splitLetter) this.plugin.settings.splitLine.splitLetter = {};
                                    this.plugin.settings.splitLine.splitLetter.width = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );

                new Setting(containerEl)
                    .setName('SplitLetter height')
                    .setDesc('Height of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('300')
                            .setValue((this.plugin.settings.splitLine?.splitLetter?.height || 300).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 100 && num <= 400) {
                                    if (!this.plugin.settings.splitLine) this.plugin.settings.splitLine = {};
                                    if (!this.plugin.settings.splitLine.splitLetter) this.plugin.settings.splitLine.splitLetter = {};
                                    this.plugin.settings.splitLine.splitLetter.height = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );
            }

            // SplitLine mode settings
            if (this.plugin.settings.splitLine?.displayMode === 'SplitLine') {
                new Setting(containerEl)
                    .setName('SplitLine width')
                    .setDesc('Width of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('600')
                            .setValue((this.plugin.settings.splitLine?.splitLine?.width || 600).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 200 && num <= 800) {
                                    if (!this.plugin.settings.splitLine) this.plugin.settings.splitLine = {};
                                    if (!this.plugin.settings.splitLine.splitLine) this.plugin.settings.splitLine.splitLine = {};
                                    this.plugin.settings.splitLine.splitLine.width = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );

                new Setting(containerEl)
                    .setName('SplitLine height')
                    .setDesc('Height of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('300')
                            .setValue((this.plugin.settings.splitLine?.splitLine?.height || 300).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 100 && num <= 400) {
                                    if (!this.plugin.settings.splitLine) this.plugin.settings.splitLine = {};
                                    if (!this.plugin.settings.splitLine.splitLine) this.plugin.settings.splitLine.splitLine = {};
                                    this.plugin.settings.splitLine.splitLine.height = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );
            }
        } else if (this.plugin.settings.readerType === 'threeSplitLine') {
            // ThreeSplitLine display mode settings
            new Setting(containerEl)
                .setName('ThreeSplitLine display mode')
                .setDesc('Choose how text is displayed in ThreeSplitLine mode')
                .addDropdown(dropdown =>
                    dropdown
                        .addOption('ThreeSplitLine', 'Three Split Line')
                        .addOption('ThreeSplitLetter', 'Three Split Letter')
                        .setValue(this.plugin.settings.threeSplitLine?.displayMode || 'ThreeSplitLine')
                        .onChange(async (value) => {
                            if (!this.plugin.settings.threeSplitLine) {
                                this.plugin.settings.threeSplitLine = {};
                            }
                            this.plugin.settings.threeSplitLine.displayMode = value as 'ThreeSplitLine' | 'ThreeSplitLetter';
                            await this.updateModalSettings();
                            this.display(); // Refresh to show/hide relevant options
                        }),
                );

            // ThreeSplitLetter mode settings
            if (this.plugin.settings.threeSplitLine?.displayMode === 'ThreeSplitLetter') {
                new Setting(containerEl)
                    .setName('ThreeSplitLetter width')
                    .setDesc('Width of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('600')
                            .setValue((this.plugin.settings.threeSplitLine?.threeSplitLetter?.width || 600).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 200 && num <= 800) {
                                    if (!this.plugin.settings.threeSplitLine) this.plugin.settings.threeSplitLine = {};
                                    if (!this.plugin.settings.threeSplitLine.threeSplitLetter) this.plugin.settings.threeSplitLine.threeSplitLetter = {};
                                    this.plugin.settings.threeSplitLine.threeSplitLetter.width = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );

                new Setting(containerEl)
                    .setName('ThreeSplitLetter height')
                    .setDesc('Height of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('300')
                            .setValue((this.plugin.settings.threeSplitLine?.threeSplitLetter?.height || 300).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 100 && num <= 400) {
                                    if (!this.plugin.settings.threeSplitLine) this.plugin.settings.threeSplitLine = {};
                                    if (!this.plugin.settings.threeSplitLine.threeSplitLetter) this.plugin.settings.threeSplitLine.threeSplitLetter = {};
                                    this.plugin.settings.threeSplitLine.threeSplitLetter.height = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );
            }

            // ThreeSplitLine mode settings
            if (this.plugin.settings.threeSplitLine?.displayMode === 'ThreeSplitLine') {
                new Setting(containerEl)
                    .setName('ThreeSplitLine width')
                    .setDesc('Width of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('600')
                            .setValue((this.plugin.settings.threeSplitLine?.threeSplitLine?.width || 600).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 200 && num <= 800) {
                                    if (!this.plugin.settings.threeSplitLine) this.plugin.settings.threeSplitLine = {};
                                    if (!this.plugin.settings.threeSplitLine.threeSplitLine) this.plugin.settings.threeSplitLine.threeSplitLine = {};
                                    this.plugin.settings.threeSplitLine.threeSplitLine.width = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );

                new Setting(containerEl)
                    .setName('ThreeSplitLine height')
                    .setDesc('Height of the display area in pixels')
                    .addText(text =>
                        text
                            .setPlaceholder('300')
                            .setValue((this.plugin.settings.threeSplitLine?.threeSplitLine?.height || 300).toString())
                            .onChange(async (value) => {
                                const num = parseInt(value);
                                if (!isNaN(num) && num >= 100 && num <= 400) {
                                    if (!this.plugin.settings.threeSplitLine) this.plugin.settings.threeSplitLine = {};
                                    if (!this.plugin.settings.threeSplitLine.threeSplitLine) this.plugin.settings.threeSplitLine.threeSplitLine = {};
                                    this.plugin.settings.threeSplitLine.threeSplitLine.height = num;
                                    await this.updateModalSettings();
                                }
                            }),
                    );
            }
        }

        const currentDisplayMode = this.plugin.settings.rsvp?.displayMode || 'ellipse';

        // Single line specific settings
        if (currentDisplayMode === 'single-line') {
            containerEl.createEl('div', { 
                text: 'Note: In single-line mode, chunk size directly controls the number of words displayed.',
                cls: 'setting-item-description'
            });

            new Setting(containerEl)
                .setName('Line width (words)')
                .setDesc('Maximum number of words per line in single-line mode')
                .addText(text =>
                    text
                        .setPlaceholder('8')
                        .setValue((this.plugin.settings.rsvp?.singleLine?.wordsPerLine || 8).toString())
                        .onChange(async (value) => {
                            const wordsPerLine = parseInt(value) || 8;
                            if (!this.plugin.settings.rsvp) this.plugin.settings.rsvp = {};
                            if (!this.plugin.settings.rsvp.singleLine) this.plugin.settings.rsvp.singleLine = {};
                            this.plugin.settings.rsvp.singleLine.wordsPerLine = wordsPerLine;
                            
                            // Update chunk size immediately when changing words per line
                            if (this.plugin.settings.rsvp.displayMode === 'single-line') {
                                this.plugin.settings.chunkSize = wordsPerLine;
                            }
                            
                            await this.updateModalSettings();
                        }),
                );
        }

        // Multi-line specific settings
        if (currentDisplayMode === 'multi-line') {
            containerEl.createEl('div', { 
                text: 'Note: In multi-line mode, chunk size is automatically adjusted to fit the rectangle area.',
                cls: 'setting-item-description'
            });

            new Setting(containerEl)
                .setName('Number of rows')
                .setDesc('Number of text rows (1-7)')
                .addSlider(slider =>
                    slider
                        .setLimits(1, 7, 1)
                        .setValue(this.plugin.settings.rsvp?.multiLine?.rows || 3)
                        .setDynamicTooltip()
                        .onChange(async (value) => {
                            if (!this.plugin.settings.rsvp) this.plugin.settings.rsvp = {};
                            if (!this.plugin.settings.rsvp.multiLine) this.plugin.settings.rsvp.multiLine = {};
                            this.plugin.settings.rsvp.multiLine.rows = value;
                            await this.updateModalSettings();
                        }),
                )
                .addText(text =>
                    text
                        .setPlaceholder('3')
                        .setValue((this.plugin.settings.rsvp?.multiLine?.rows || 3).toString())
                        .onChange(async (value) => {
                            const num = parseInt(value);
                            if (!isNaN(num) && num >= 1 && num <= 7) {
                                if (!this.plugin.settings.rsvp) this.plugin.settings.rsvp = {};
                                if (!this.plugin.settings.rsvp.multiLine) this.plugin.settings.rsvp.multiLine = {};
                                this.plugin.settings.rsvp.multiLine.rows = num;
                                await this.updateModalSettings();
                            }
                        }),
                );

            new Setting(containerEl)
                .setName('Rectangle width')
                .setDesc('Width of the rectangle in pixels')
                .addText(text =>
                    text
                        .setPlaceholder('400')
                        .setValue((this.plugin.settings.rsvp?.multiLine?.width || 400).toString())
                        .onChange(async (value) => {
                            const num = parseInt(value);
                            if (!isNaN(num) && num >= 200 && num <= 800) {
                                if (!this.plugin.settings.rsvp) this.plugin.settings.rsvp = {};
                                if (!this.plugin.settings.rsvp.multiLine) this.plugin.settings.rsvp.multiLine = {};
                                this.plugin.settings.rsvp.multiLine.width = num;
                                await this.updateModalSettings();
                            }
                        }),
                );
        }

        // Ellipse specific settings (only for RSVP mode)
        if (this.plugin.settings.readerType === 'rsvp' && currentDisplayMode === 'ellipse') {
            containerEl.createEl('div', { 
                text: 'Note: In ellipse mode, chunk size is automatically adjusted to fit the ellipse area.',
                cls: 'setting-item-description'
            });

            new Setting(containerEl)
                .setName('Ellipse width')
                .setDesc('Width of the ellipse in pixels')
                .addText(text =>
                    text
                        .setPlaceholder('300')
                        .setValue((this.plugin.settings.rsvp?.ellipse?.width || 300).toString())
                        .onChange(async (value) => {
                            const num = parseInt(value);
                            if (!isNaN(num) && num >= 200 && num <= 600) {
                                if (!this.plugin.settings.rsvp) this.plugin.settings.rsvp = {};
                                if (!this.plugin.settings.rsvp.ellipse) this.plugin.settings.rsvp.ellipse = {};
                                this.plugin.settings.rsvp.ellipse.width = num;
                                await this.updateModalSettings();
                            }
                        }),
                );

            new Setting(containerEl)
                .setName('Ellipse height')
                .setDesc('Height of the ellipse in pixels')
                .addText(text =>
                    text
                        .setPlaceholder('200')
                        .setValue((this.plugin.settings.rsvp?.ellipse?.height || 200).toString())
                        .onChange(async (value) => {
                            const num = parseInt(value);
                            if (!isNaN(num) && num >= 100 && num <= 400) {
                                if (!this.plugin.settings.rsvp) this.plugin.settings.rsvp = {};
                                if (!this.plugin.settings.rsvp.ellipse) this.plugin.settings.rsvp.ellipse = {};
                                this.plugin.settings.rsvp.ellipse.height = num;
                                await this.updateModalSettings();
                            }
                        }),
                );
        }
    }
}