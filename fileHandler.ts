import { App, TFile, FileSystemAdapter } from 'obsidian';
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';
import EPub from 'epub2';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export class FileHandler {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Čita sadržaj datoteke na osnovu njenog formata
     */
    async readFile(file: TFile): Promise<string> {
        const extension = file.extension.toLowerCase();

        switch (extension) {
            case 'md':
            case 'txt':
                return await this.app.vault.read(file);
            case 'pdf':
                return await this.extractTextFromPDF(file);
            case 'docx':
                return await this.extractTextFromDOCX(file);
            case 'epub':
                return await this.extractTextFromEPUB(file);
            default:
                throw new Error(`Unsupported file type: ${extension}`);
        }
    }

    /**
     * Provjerava da li je datoteka podržana
     */
    isSupportedFile(file: TFile): boolean {
        const ext = file.extension.toLowerCase();
        console.log('Checking file support for extension:', ext);
        return ['md', 'txt', 'pdf', 'docx', 'epub'].includes(ext);
    }

    /**
     * Vraća listu svih podržanih datoteka u vault-u
     */
    getSupportedFiles(): TFile[] {
        return this.app.vault.getFiles().filter(file => this.isSupportedFile(file));
    }

    /**
     * Izvlači tekst iz PDF datoteke
     */
    private async extractTextFromPDF(file: TFile): Promise<string> {
        try {
            const arrayBuffer = await this.app.vault.adapter.readBinary(file.path);
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            let fullText = '';
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                try {
                    const page = await pdf.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    
                    const pageText = textContent.items
                        .map((item: any) => ('str' in item) ? item.str : '')
                        .join(' ');
                    
                    fullText += pageText + '\n\n';
                } catch (pageError) {
                    console.error(`Error reading page ${pageNum}:`, pageError);
                }
            }
            
            return fullText.trim();
        } catch (error) {
            console.error('PDF extraction error:', error);
            throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Izvlači tekst iz DOCX datoteke
     */
    private async extractTextFromDOCX(file: TFile): Promise<string> {
        try {
            const arrayBuffer = await this.app.vault.adapter.readBinary(file.path);
            const result = await mammoth.extractRawText({ arrayBuffer });
            
            if (result.messages?.length > 0) {
                console.warn('DOCX extraction warnings:', result.messages);
            }
            
            return result.value;
        } catch (error) {
            console.error('DOCX extraction error:', error);
            throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Izvlači tekst iz EPUB datoteke
     */
    private async extractTextFromEPUB(file: TFile): Promise<string> {
        try {
            const arrayBuffer = await this.app.vault.adapter.readBinary(file.path);
            
            return new Promise(async (resolve, reject) => {
                const tempDir = os.tmpdir();
                const tempFilePath = path.join(tempDir, `temp_${Date.now()}.epub`);
                
                try {
                    await fs.writeFile(tempFilePath, Buffer.from(arrayBuffer));
                    const epub = new EPub(tempFilePath);
                
                    epub.on('error', (error: Error) => {
                        console.error('EPUB parsing error:', error);
                        reject(new Error(`Failed to parse EPUB: ${error.message}`));
                    });

                    epub.on('end', () => {
                        const chapters = epub.flow;
                        let fullText = '';
                        let processedChapters = 0;
                        
                        if (chapters.length === 0) {
                            resolve('');
                            return;
                        }
                        
                        chapters.forEach((chapter: any, index: number) => {
                            epub.getChapter(chapter.id, (error: Error, text?: string) => {
                                if (error) {
                                    console.error(`Error reading chapter ${index}:`, error);
                                } else if (text) {
                                    const cleanText = text
                                        .replace(/<[^>]*>/g, ' ')
                                        .replace(/\s+/g, ' ')
                                        .trim();
                                    fullText += cleanText + '\n\n';
                                }
                                
                                processedChapters++;
                                if (processedChapters === chapters.length) {
                                    resolve(fullText.trim());
                                }
                            });
                        });
                    });

                    epub.parse();
                    
                    epub.on('end', async () => {
                        try {
                            await fs.unlink(tempFilePath);
                        } catch (cleanupError) {
                            console.error('Error cleaning up temp file:', cleanupError);
                        }
                    });
                } catch (error) {
                    console.error('EPUB extraction error:', error);
                    reject(new Error(`Failed to extract text from EPUB: ${error instanceof Error ? error.message : String(error)}`));
                    
                    try {
                        await fs.unlink(tempFilePath);
                    } catch (cleanupError) {
                        console.error('Error cleaning up temp file:', cleanupError);
                    }
                }
            });
        } catch (error) {
            console.error('EPUB extraction error:', error);
            throw new Error(`Failed to extract text from EPUB: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Vraća ikonu na osnovu ekstenzije datoteke
     */
    getFileIcon(extension: string): string {
        switch (extension.toLowerCase()) {
            case 'md': return '📝';
            case 'txt': return '📄';
            case 'pdf': return '📕';
            case 'docx': return '📘';
            case 'epub': return '📚';
            default: return '📄';
        }
    }
}
                    