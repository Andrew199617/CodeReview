import * as vscode from 'vscode';

/**
 * ACR-19: Toggles the Diff Editor render mode.
 */
export async function toggleDiffMode() {
    // Access VS Code's internal configuration for the diff editor
    const config = vscode.workspace.getConfiguration('diffEditor');
    
    // Get the current state (true if side-by-side, false if inline)
    const isSideBySide = config.get('renderSideBySide');

    // Toggle the setting and save it globally
    await config.update('renderSideBySide', !isSideBySide, vscode.ConfigurationTarget.Global);
    
    // Give VS Code a tiny moment to process the change
    await new Promise(resolve => setTimeout(resolve, 100));

    // Force refresh the current diff editor by closing and reopening it
    // This prevents the "invalid column number" error by resetting the view
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.commands.executeCommand('workbench.action.reopenClosedEditor');
    
    // Show a notification so you know it worked
    const mode = !isSideBySide ? "Side by Side" : "Inline (Combined)";
    vscode.window.showInformationMessage(`Diff mode switched to: ${mode}`);
}