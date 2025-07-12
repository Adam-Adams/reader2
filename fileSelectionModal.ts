import { App, Modal, TFile } from 'obsidian';
import { FileHandler } from './fileHandler';
import './styles_fSM.css';

export interface FileSelectionModalSettings {
    windowState: {
        left: string;
        top: string;
        width: string;
        height: string;
    };
}

export class FileSelectionModal extends Modal {
    private fileHandler: FileHandler;
    private callback: (file: TFile) => void;
    private plugin: any; // SpeedReaderPlugin type
    private settings: FileSelectionModalSettings;
    private searchInput!: HTMLInputElement;
    private fileList!: HTMLElement;
    private allFiles: TFile[] = [];
    private filteredFiles: TFile[] = [];
    private selectedIndex: number = -1;
    private fileItems: HTMLElement[] = [];
    private windowResizeObserver?: ResizeObserver;
    private modalResizeObserver?: ResizeObserver;

    constructor(app: App, fileHandler: FileHandler, callback: (file: TFile) => void, plugin: any, settings: FileSelectionModalSettings) {
        super(app);
        this.fileHandler = fileHandler;
        this.callback = callback;
        this.plugin = plugin;
        this.settings = settings;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('file-selection-modal');

        // Uvek postavi modal na position: fixed
        const modalContent = contentEl.parentElement as HTMLElement;
        if (modalContent) {
            modalContent.style.position = 'fixed';
            modalContent.style.maxHeight = `${window.innerHeight * 0.95}px`;
            modalContent.style.margin = '0';
        }

        // Restore window state first
        this.restoreWindowState();
        
        const headerEl = contentEl.createDiv('file-selection-header');
        headerEl.createEl('h2', { text: 'Select File to Read' });

        const searchContainer = contentEl.createDiv('search-container');
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search files...',
            cls: 'file-search-input'
        });

        // Event listeners for search input
        this.searchInput.addEventListener('input', () => {
            this.filterFiles();
        });

        this.searchInput.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });

        this.fileList = contentEl.createDiv('file-list');
        this.loadFiles();

        // Add resize handles
        this.addResizeHandles();

        // Setup resize observers
        this.setupResizeObservers();

        // Setup window resize listener
        this.setupWindowResizeListener();

        // Make header draggable
        headerEl.addClass('modal-draggable');
        this.makeDraggable(headerEl);
        
        // Focus search input after a brief delay to ensure modal is fully rendered
        setTimeout(() => {
            this.searchInput.focus();
            // DODANO: Ažuriraj širinu nakon što se modal potpuno učita
            this.updateAllElementWidths();
            this.updateFileListHeight();
        }, 100);
    }

    private setupResizeObservers() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        
        // Observer for modal size changes
        this.modalResizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                this.handleModalResize(entry);
            }
            
            // Debounce saving window state
            clearTimeout((this as any).saveTimeout);
            (this as any).saveTimeout = setTimeout(() => {
                this.saveWindowState();
            }, 500);
        });
        
        this.modalResizeObserver.observe(modalContent);
    }

    private setupWindowResizeListener() {
        // Listen for window resize events
        const handleWindowResize = () => {
            this.adjustModalToViewport();
            this.updateElementSizes();
        };
        
        window.addEventListener('resize', handleWindowResize);
        
        // Store the listener for cleanup
        (this as any).windowResizeListener = handleWindowResize;
    }

    private handleModalResize(entry: ResizeObserverEntry) {
        const { width, height } = entry.contentRect;
        
        // Update file list max height based on modal size
        this.updateFileListHeight();
        
        // Update search input width
        //this.updateSearchInputWidth();

        // Update ALL element widths - IZMENJENO
        this.updateAllElementWidths();
        
        // Ensure modal stays within viewport
        this.ensureModalWithinViewport();
    }

    private updateAllElementWidths() {
        setTimeout(() => {
            const modalContent = this.contentEl.parentElement as HTMLElement;
            const modalWidth = modalContent.offsetWidth;
            
            // Ažuriraj širinu glavnog kontejnera
            this.contentEl.style.width = '100%';
            
            // Ažuriraj širinu search input-a
            const searchContainer = this.contentEl.querySelector('.search-container') as HTMLElement;
            if (searchContainer) {
                searchContainer.style.width = '100%';
                const padding = 40; // 20px padding na svakoj strani
                const newWidth = Math.max(200, modalWidth - padding);
                this.searchInput.style.width = `${newWidth - 40}px`; // Oduzmi padding search kontejnera
            }
            
            // Ažuriraj širinu header-a
            const header = this.contentEl.querySelector('.file-selection-header') as HTMLElement;
            if (header) {
                header.style.width = '100%';
            }
            
            // Ažuriraj širinu file liste
            const fileList = this.contentEl.querySelector('.file-list') as HTMLElement;
            if (fileList) {
                fileList.style.width = '100%';
            }
            
            // Ažuriraj širinu file item-a
            this.fileItems.forEach(item => {
                item.style.width = 'calc(100% - 16px)'; // Oduzmi margin
                const fileContent = item.querySelector('.file-content') as HTMLElement;
                if (fileContent) {
                    fileContent.style.width = '100%';
                }
            });
        }, 0);
    }

private updateFileListHeight() {
    const modalContent = this.contentEl.parentElement as HTMLElement;
    const modalHeight = modalContent.offsetHeight;
    
    // Preciznije merenje visina
    const header = this.contentEl.querySelector('.file-selection-header') as HTMLElement;
    const searchContainer = this.contentEl.querySelector('.search-container') as HTMLElement;
    
    const headerHeight = header ? header.offsetHeight : 0;
    const searchHeight = searchContainer ? searchContainer.offsetHeight : 0;
    
    // Dodajte padding, border i margin rezerve
    const reservedSpace = 80; // Povećano sa 32 na 80
    const availableHeight = modalHeight - headerHeight - searchHeight - reservedSpace;
    
    // Minimalna i maksimalna visina
    const minHeight = 150;
    const maxPossibleHeight = Math.max(minHeight, availableHeight);
    
    // Ne dozvoli da file-list bude veći od 65% ukupne visine modala
    //const maxAllowedHeight = modalHeight * 0.65;
    const maxAllowedHeight = availableHeight - 20;
    const finalHeight = Math.min(maxPossibleHeight, maxAllowedHeight);
    
    // Debug log - dodajte privremeno
    console.log('Modal height:', modalHeight);
    console.log('Header height:', headerHeight);
    console.log('Search height:', searchHeight);
    console.log('Available height:', availableHeight);
    console.log('Final height:', finalHeight);
    
    this.fileList.style.maxHeight = `${finalHeight}px`;
    this.fileList.style.height = `${finalHeight}px`;
}

    private updateSearchInputWidth() {
        this.updateAllElementWidths();
    }

    private adjustModalToViewport() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        const rect = modalContent.getBoundingClientRect();
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;
        
        let needsUpdate = false;
        let newLeft = rect.left;
        let newTop = rect.top;
        let newWidth = rect.width;
        let newHeight = rect.height;
        
        // Adjust width if modal is wider than viewport
        if (rect.width > Math.min(840, viewWidth * 0.95)) {
            newWidth = Math.min(840, viewWidth * 0.95);
            needsUpdate = true;
        }
        
        // Adjust height if modal is taller than viewport
        if (rect.height > viewHeight * 0.9) {
            newHeight = viewHeight * 0.9;
            needsUpdate = true;
        }
        
        // Adjust position if modal is outside viewport
        if (rect.left + newWidth > viewWidth) {
            newLeft = viewWidth - newWidth - 20;
            needsUpdate = true;
        }
        if (rect.top + newHeight > viewHeight) {
            newTop = viewHeight - newHeight - 20;
            needsUpdate = true;
        }
        if (newLeft < 20) {
            newLeft = 20;
            needsUpdate = true;
        }
        if (newTop < 20) {
            newTop = 20;
            needsUpdate = true;
        }
        
        if (needsUpdate) {
            modalContent.style.left = `${newLeft}px`;
            modalContent.style.top = `${newTop}px`;
            modalContent.style.width = `${newWidth}px`;
            modalContent.style.height = `${newHeight}px`;
            // DODANO: Pozovi updateElementSizes nakon promene veličine
            setTimeout(() => {
                this.updateElementSizes();
            }, 0);
       }
    }

    private updateElementSizes() {
        // Update file list height
        this.updateFileListHeight();
        
        // Update search input width
        this.updateSearchInputWidth();
        
        // Refresh file item display if needed
        this.refreshFileItemSizes();
    }

    private refreshFileItemSizes() {
        // Force reflow of file items to handle text truncation
        this.fileItems.forEach(item => {
            const fileContent = item.querySelector('.file-content') as HTMLElement;
            if (fileContent) {
                // Trigger reflow
                fileContent.style.width = '100%';
                fileContent.offsetHeight; // Force reflow
            }
        });
    }

    private ensureModalWithinViewport() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        const rect = modalContent.getBoundingClientRect();
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;
        
        let newLeft = rect.left;
        let newTop = rect.top;
        let needsUpdate = false;
        
        // DODAJTE OVO: Proverite da li je modal veći od dozvoljene visine
        if (rect.height > viewHeight * 0.95) {
            modalContent.style.height = `${viewHeight * 0.95}px`;
            needsUpdate = true;
        }

        // Keep modal within viewport bounds
        if (rect.right > viewWidth) {
            newLeft = viewWidth - rect.width - 20;
            needsUpdate = true;
        }
        if (rect.bottom > viewHeight) {
            newTop = viewHeight - rect.height - 20;
            needsUpdate = true;
        }
        if (newLeft < 20) {
            newLeft = 20;
            needsUpdate = true;
        }
        if (newTop < 20) {
            newTop = 20;
            needsUpdate = true;
        }
        
        if (needsUpdate) {
            modalContent.style.left = `${newLeft}px`;
            modalContent.style.top = `${newTop}px`;
        }
    }

    private loadFiles() {
        this.allFiles = this.fileHandler.getSupportedFiles();
        this.allFiles.sort((a, b) => a.name.localeCompare(b.name));
        this.filteredFiles = [...this.allFiles];
        this.displayFiles();
    }

    private filterFiles() {
        const query = this.searchInput.value.toLowerCase().trim();
        
        if (query === '') {
            this.filteredFiles = [...this.allFiles];
        } else {
            this.filteredFiles = this.allFiles.filter(file => 
                file.name.toLowerCase().includes(query) || 
                file.path.toLowerCase().includes(query)
            );
        }
        
        this.selectedIndex = -1; // Reset selection when filtering
        this.displayFiles();
    }

    private displayFiles() {
        this.fileList.empty();
        this.fileItems = [];

        if (this.filteredFiles.length === 0) {
            const noFilesMessage = this.fileList.createEl('div', {
                text: this.allFiles.length === 0 
                    ? 'No supported files found in vault' 
                    : 'No files match your search',
                cls: 'no-files-message'
            });
            return;
        }

        this.filteredFiles.forEach((file, index) => {
            const fileItem = this.fileList.createDiv('file-item');
            this.fileItems.push(fileItem);
            
            const fileIcon = fileItem.createEl('span', { cls: 'file-icon' });
            fileIcon.textContent = this.fileHandler.getFileIcon(file.extension);
            
            const fileContent = fileItem.createDiv('file-content');
            
            const fileName = fileContent.createEl('span', { 
                text: file.name,
                cls: 'file-name'
            });
            
            const filePath = fileContent.createEl('span', {
                text: file.path,
                cls: 'file-path'
            });

            // Click handler
            fileItem.addEventListener('click', () => {
                this.selectFile(index);
            });

            // Keyboard handler for individual items
            fileItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.selectFile(index);
                }
            });

            fileItem.tabIndex = 0;
            fileItem.setAttribute('data-index', index.toString());
        });

        // Update sizes after displaying files
        setTimeout(() => {
            this.updateElementSizes();
            this.updateFileListHeight();
        }, 0);
    }

    private handleKeydown(e: KeyboardEvent) {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.navigateDown();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.navigateUp();
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredFiles.length) {
                    this.selectFile(this.selectedIndex);
                }
                break;
            case 'Escape':
                e.preventDefault();
                this.close();
                break;
            case 'Home':
                e.preventDefault();
                this.navigateToFirst();
                break;
            case 'End':
                e.preventDefault();
                this.navigateToLast();
                break;
        }
    }

    private navigateDown() {
        if (this.filteredFiles.length === 0) return;
        
        this.selectedIndex = (this.selectedIndex + 1) % this.filteredFiles.length;
        this.updateSelection();
    }

    private navigateUp() {
        if (this.filteredFiles.length === 0) return;
        
        this.selectedIndex = this.selectedIndex <= 0 
            ? this.filteredFiles.length - 1 
            : this.selectedIndex - 1;
        this.updateSelection();
    }

    private navigateToFirst() {
        if (this.filteredFiles.length === 0) return;
        
        this.selectedIndex = 0;
        this.updateSelection();
    }

    private navigateToLast() {
        if (this.filteredFiles.length === 0) return;
        
        this.selectedIndex = this.filteredFiles.length - 1;
        this.updateSelection();
    }

    private updateSelection() {
        // Remove previous selection
        this.fileItems.forEach((item, index) => {
            item.classList.toggle('selected', index === this.selectedIndex);
        });

        // Scroll selected item into view
        if (this.selectedIndex >= 0 && this.selectedIndex < this.fileItems.length) {
            const selectedItem = this.fileItems[this.selectedIndex];
            selectedItem.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest' 
            });
        }
    }

    private selectFile(index: number) {
        if (index >= 0 && index < this.filteredFiles.length) {
            const selectedFile = this.filteredFiles[index];
            this.callback(selectedFile);
            this.close();
        }
    }

    private addResizeHandles() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        
        const rightHandle = modalContent.createDiv('resize-handle resize-handle-right');
        this.makeResizable(rightHandle, 'right');
        
        const bottomHandle = modalContent.createDiv('resize-handle resize-handle-bottom');
        this.makeResizable(bottomHandle, 'bottom');
        
        const cornerHandle = modalContent.createDiv('resize-handle resize-handle-corner');
        this.makeResizable(cornerHandle, 'corner');
    }

    private makeResizable(handle: HTMLElement, direction: 'right' | 'bottom' | 'corner') {
        let isResizing = false;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;
        
        const modalContent = this.contentEl.parentElement as HTMLElement;
        
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(window.getComputedStyle(modalContent).width, 10);
            startHeight = parseInt(window.getComputedStyle(modalContent).height, 10);
            
            e.preventDefault();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            if (direction === 'right' || direction === 'corner') {
                const newWidth = Math.max(450, Math.min(840, startWidth + deltaX));
                modalContent.style.width = newWidth + 'px';
                // DODANO: Odmah ažuriraj širinu search input-a
                this.updateAllElementWidths();
            }
            
            if (direction === 'bottom' || direction === 'corner') {
                const newHeight = Math.max(300, Math.min(window.innerHeight * 0.95, startHeight + deltaY));
                modalContent.style.height = newHeight + 'px';
                // DODANO: Ažuriraj i visinu file liste
                this.updateFileListHeight();
            }
        };
        
        const handleMouseUp = () => {
            if (isResizing) {
                this.saveWindowState();
                this.updateElementSizes();
            }
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }

    private makeDraggable(handle: HTMLElement) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        
        const modalContent = this.contentEl.parentElement as HTMLElement;
        
        handle.addEventListener('mousedown', (e) => {
            if ((e.target as HTMLElement).tagName === 'BUTTON' || 
                (e.target as HTMLElement).tagName === 'INPUT') {
                return;
            }
            
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
            
            const newLeft = Math.max(0, Math.min(window.innerWidth - 450, startLeft + deltaX));
            const newTop = Math.max(0, Math.min(window.innerHeight - 200, startTop + deltaY));
            
            modalContent.style.left = newLeft + 'px';
            modalContent.style.top = newTop + 'px';
        };
        
        const handleMouseUp = () => {
            if (isDragging) {
                this.saveWindowState();
            }
            isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }

    private saveWindowState() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        const rect = modalContent.getBoundingClientRect();
        
        this.settings.windowState = {
            left: modalContent.style.left || rect.left + 'px',
            top: modalContent.style.top || rect.top + 'px',
            width: modalContent.style.width || rect.width + 'px',
            height: modalContent.style.height || rect.height + 'px'
        };
        
        this.plugin.saveSettings().catch((err: Error) => 
            console.error('Failed to save file selection modal window state:', err)
        );
    }

    private restoreWindowState() {
        const modalContent = this.contentEl.parentElement as HTMLElement;
        const state = this.settings.windowState;
        if (!state || state.left === 'auto' || state.top === 'auto') {
            return;
        }

        // Ograniči širinu/visinu na dozvoljene vrednosti
        const minWidth = 450;
        const maxWidth = 840;
        const minHeight = 300;
        const maxHeight = window.innerHeight * 0.95;

        if (state.width !== 'auto') {
            let requestedWidth = parseInt(state.width);
            requestedWidth = Math.max(minWidth, Math.min(maxWidth, requestedWidth));
            modalContent.style.width = `${requestedWidth}px`;
        }
        if (state.height !== 'auto') {
            let requestedHeight = parseInt(state.height);
            requestedHeight = Math.max(minHeight, Math.min(maxHeight, requestedHeight));
            modalContent.style.height = `${requestedHeight}px`;
        }

        if (state.left !== 'auto' && state.top !== 'auto') {
            modalContent.style.position = 'fixed';
            modalContent.style.left = state.left;
            modalContent.style.top = state.top;
            modalContent.style.margin = '0';
            this.ensureModalWithinViewport();
        }
    }

    private ensureModalVisible(modalContent: HTMLElement) {
        // Sada ne koristi argument, već uvek koristi parent modal
        const modal = this.contentEl.parentElement as HTMLElement;
        const rect = modal.getBoundingClientRect();
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;

        let left = rect.left;
        let top = rect.top;
        let width = rect.width;
        let height = rect.height;

        // Ograniči širinu/visinu
        const minWidth = 450;
        const maxWidth = 840;
        const minHeight = 300;
        const maxHeight = viewHeight * 0.95;
        width = Math.max(minWidth, Math.min(maxWidth, width));
        height = Math.max(minHeight, Math.min(maxHeight, height));
        modal.style.width = `${width}px`;
        modal.style.height = `${height}px`;

        // Ograniči poziciju
        if (left + width > viewWidth) {
            left = viewWidth - width - 20;
        }
        if (left < 20) {
            left = 20;
        }
        if (top + height > viewHeight) {
            top = viewHeight - height - 20;
        }
        if (top < 20) {
            top = 20;
        }
        modal.style.left = left + 'px';
        modal.style.top = top + 'px';
    }

    onClose() {
        if ((this as any).saveTimeout) {
            clearTimeout((this as any).saveTimeout);
        }

        this.saveWindowState();
        const { contentEl } = this;
        
        // Clean up resize observers
        if (this.modalResizeObserver) {
            this.modalResizeObserver.disconnect();
        }
        
        // Clean up window resize listener
        if ((this as any).windowResizeListener) {
            window.removeEventListener('resize', (this as any).windowResizeListener);
        }
        
        contentEl.empty();
        
        // Clean up event listeners
        this.fileItems = [];
        this.selectedIndex = -1;
        
    }
}