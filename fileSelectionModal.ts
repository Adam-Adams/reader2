import { App, Modal, TFile } from 'obsidian';
import { FileHandler } from './fileHandler';

export class FileSelectionModal extends Modal {
    private fileHandler: FileHandler;
    private callback: (file: TFile) => void;
    private searchInput!: HTMLInputElement;
    private fileList!: HTMLElement;
    private allFiles: TFile[] = [];
    private filteredFiles: TFile[] = [];

    constructor(app: App, fileHandler: FileHandler, callback: (file: TFile) => void) {
        super(app);
        this.fileHandler = fileHandler;
        this.callback = callback;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('file-selection-modal');

        // Load CSS styles from external file
        const cssPath = this.app.vault.adapter.getResourcePath('styles.css');
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssPath;
        document.head.appendChild(link);

        const headerEl = contentEl.createDiv('file-selection-header');
        headerEl.createEl('h2', { text: 'Select File to Read' });

        const searchContainer = contentEl.createDiv('search-container');
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search files...',
            cls: 'file-search-input'
        });

        this.searchInput.addEventListener('input', () => {
            this.filterFiles();
        });

        this.fileList = contentEl.createDiv('file-list');
        this.loadFiles();
        setTimeout(() => this.searchInput.focus(), 100);
    }

    loadFiles() {
        this.allFiles = this.fileHandler.getSupportedFiles();
        this.allFiles.sort((a, b) => a.name.localeCompare(b.name));
        this.filteredFiles = [...this.allFiles];
        this.displayFiles();
    }

    filterFiles() {
        const query = this.searchInput.value.toLowerCase();
        this.filteredFiles = this.allFiles.filter(file => 
            file.name.toLowerCase().includes(query) || 
            file.path.toLowerCase().includes(query)
        );
        this.displayFiles();
    }

    displayFiles() {
        this.fileList.empty();

        if (this.filteredFiles.length === 0) {
            this.fileList.createEl('div', {
                text: 'No supported files found',
                cls: 'no-files-message'
            });
            return;
        }

        this.filteredFiles.forEach(file => {
            const fileItem = this.fileList.createDiv('file-item');
            
            const fileIcon = fileItem.createEl('span', { cls: 'file-icon' });
            fileIcon.textContent = this.fileHandler.getFileIcon(file.extension);
            
            const fileName = fileItem.createEl('span', { 
                text: file.name,
                cls: 'file-name'
            });
            
            const filePath = fileItem.createEl('span', {
                text: file.path,
                cls: 'file-path'
            });

            fileItem.addEventListener('click', () => {
                this.callback(file);
                this.close();
            });

            fileItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.callback(file);
                    this.close();
                }
            });

            fileItem.tabIndex = 0;
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}