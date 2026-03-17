import vscode from 'vscode';

export async function toggleDiffMode() {
    const config = vscode.workspace.getConfiguration('diffEditor');
    const isSideBySide = config.get('renderSideBySide');

    // Toggle the setting
    await config.update('renderSideBySide', !isSideBySide, vscode.ConfigurationTarget.Global);
    
    // Show a small popup to confirm
    const mode = !isSideBySide ? "Side by Side" : "Inline (Combined)";
    vscode.window.showInformationMessage(`Diff mode switched to: ${mode}`);
}