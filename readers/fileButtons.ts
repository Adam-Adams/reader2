import { App, TFile } from 'obsidian';
import { SpeedReaderSettings } from '../main';
import { FileSelectionModal } from '../fileSelectionModal';
import { TextInputModal } from '../textInputModal';

export class FileButtons {
    private buttonArea: HTMLElement;
    private selectedFileInfo: HTMLElement;
    private onFileSelected: (file: TFile) => void;
    private onTextEntered: (text: string) => void;

    constructor(
        container: HTMLElement,
        app: App,
        plugin: any,
        settings: SpeedReaderSettings,
        onFileSelected: (file: TFile) => void,
        onTextEntered: (text: string) => void
    ) {
        // Create button area
        this.buttonArea = container.createDiv('speed-reader-buttons');
        this.selectedFileInfo = container.createDiv('selected-file-info');
        this.onFileSelected = onFileSelected;
        this.onTextEntered = onTextEntered;

        // Create buttons
        const fileButton = this.buttonArea.createEl('button', {
            text: 'Select File',
            cls: 'speed-reader-btn file-select-btn'
        });
        const textInputButton = this.buttonArea.createEl('button', {
            text: 'Enter Text',
            cls: 'speed-reader-btn text-input-btn'
        });

        // Add event listeners
        fileButton.addEventListener('click', () => {
            new FileSelectionModal(
                app,
                plugin.fileHandler,
                (file) => this.onFileSelected(file),
                plugin,
                settings.fileSelectionModalSettings || {
                    windowState: {
                        left: 'auto',
                        top: 'auto',
                        width: '600px',
                        height: '500px'
                    }
                }
            ).open();
        });

        textInputButton.addEventListener('click', () => {
            new TextInputModal(app, (text) => {
                this.onTextEntered(text);
            }, plugin, plugin.settings.textInputModalSettings).open();
        });
    }

    getInfoElement(): HTMLElement {
        return this.selectedFileInfo;
    }
}
