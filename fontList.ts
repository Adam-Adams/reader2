import { App } from 'obsidian';

// Lista svih font fajlova
export const FONT_FILES = [
    'AtkinsonHyperlegible-Bold.ttf',
    'AtkinsonHyperlegible-BoldItalic.ttf',
    'AtkinsonHyperlegible-Italic.ttf',
    'AtkinsonHyperlegible-Regular.tt极f',
    'Lexend-Black.ttf',
    'Lexend-Bold.ttf',
    'Lexend-ExtraBold.ttf',
    'Lexend-ExtraLight.ttf',
    'Lexend-Light.ttf',
    'Lexend-Medium.ttf',
    'Lexend-Regular.ttf',
    'Lexend-SemiBold.ttf',
    'Lexend-Thin.ttf',
    'LexieReadable-Bold.ttf',
    'LexieReadable-Regular.ttf',
    'OpenDyslexic-Bold-Italic.eot',
    'OpenDyslexic-Bold-Italic.otf',
    'OpenDyslexic-Bold-Italic.woff',
    'OpenDyslexic-Bold-Italic.woff2',
    'OpenDyslexic-Bold.eot',
    'OpenDyslexic-Bold.otf',
    'OpenDyslexic-Bold.woff',
    'OpenDyslexic-Bold.woff2',
    'OpenDyslexic-Italic.eot',
    'OpenDyslexic-Italic.otf',
    'OpenDyslexic-Italic.woff',
    'OpenDyslexic-Italic.woff2',
    'OpenDyslexic-Regular.eot',
    'OpenDyslexic-Regular.otf',
    'OpenDyslexic-Regular.woff',
    'OpenDyslexic-Regular.woff2',
    'SairaStencilOne-Regular.ttf',
    'StardosStencil-Bold.ttf',
    'StardosStencil-Regular.ttf',
    'VastShadow-Regular.ttf'
];

export const FONT_OPTIONS = {
    // Preinstalirani fontovi (sortirano po prikaznom imenu)
    "Arial": "Arial",
    "Arial Black": "Arial Black",
    "Comic Sans MS": "Comic Sans MS",
    "Courier New": "Courier New",
    "Georgia": "Georgia",
    "Impact": "Impact",
    "Tahoma": "Tahoma",
    "Times New Roman": "Times New Roman",
    "Trebuchet MS": "Trebuchet MS",
    "Verdana": "Verdana",
    
    // Dodatni fontovi (sortirano po prikaznom imenu)
    "Atkinson-Hyperlegible": "Atkinson Hyperlegible",
    "AtkinsonHyperlegible-Bold": "Atkinson Hyperlegible Bold",
    "AtkinsonHyperlegible-BoldItalic": "Atkinson Hyperlegible Bold Italic",
    "AtkinsonHyperlegible-Italic": "Atkinson Hyperlegible Italic",
    "Lexend-Black": "Lexend Black",
    "Lexend-Bold": "Lexend Bold",
    "Lexend-ExtraBold": "Lexend ExtraBold",
    "Lexend-ExtraLight": "Lexend ExtraLight",
    "Lexend-Light": "Lexend Light",
    "Lexend-Medium": "Lexend Medium",
    "Lexend-Regular": "Lexend Regular",
    "Lexend-SemiBold": "Lexend SemiBold",
    "Lexend-Thin": "Lexend Thin",
    "LexieReadable-Bold": "Lexie Readable Bold",
    "LexieReadable-Regular": "Lexie Readable",
    "OpenDyslexic-Bold": "OpenDyslexic Bold",
    "OpenDyslexic-Bold-Italic": "OpenDyslexic Bold Italic",
    "OpenDyslexic-Italic": "OpenDyslexic Italic",
    "OpenDyslexic-Regular": "OpenDyslexic",
    "SairaStencilOne-Regular": "Saira Stencil One",
    "StardosStencil-Bold": "Stardos Stencil Bold",
    "StardosStencil-Regular": "Stardos Stencil Regular",
    "VastShadow-Regular": "Vast Shadow"
};

// Funkcija za zamenu relativnih putanja fontova sa apsolutnim
export function replaceFontPaths(cssContent: string, manifest: any, app: App): string {
    // Handle undefined manifest
    if (!manifest || !manifest.dir) {
        return cssContent;
    }
    
    for (const fontFile of FONT_FILES) {
        const relativePath = `./fonts/${fontFile}`;
        const absolutePath = app.vault.adapter.getResourcePath(`${manifest.dir}/fonts/${fontFile}`);
        cssContent = cssContent.replace(new RegExp(relativePath.replace(/\./g, '\\.'), 'g'), absolutePath);
    }
    return cssContent;
}
