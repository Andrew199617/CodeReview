import dotenv from 'dotenv';
import * as vscode from 'vscode';
import { ShelvedFilesController } from './extension/ShelvedFilesController.js';
import { ShelvedFilesTreeView } from './extension/ShelvedFilesTreeDataProvider.js';
import { ConfigService } from './services/ConfigService.js';

dotenv.config();

/**
 * Entry point for the VS Code extension activation.
 * Registers the shelved files view and its command handler.
 */
export function activate(context) {
  const configService = new ConfigService();
  const reviewUsers = configService.getReviewUsers();

  const shelvedFilesTreeView = new ShelvedFilesTreeView(reviewUsers);
  const treeView = vscode.window.createTreeView('perforce.shelvedFiles', { treeDataProvider: shelvedFilesTreeView, showCollapseAll: false });
  const shelvedFilesTreeController = new ShelvedFilesController(shelvedFilesTreeView);

  const cmdFetch = vscode.commands.registerCommand('perforce.shelvedFiles.find', shelvedFilesTreeController.promptAndFetch);

  /**
   * Command: Open a diff for the selected shelved file in the TreeView.
   * It will attempt to resolve the revision from the current CL and fetch
   * the previous revision content and the current revision content and open
   * a vscode.diff between two untitled documents.
   */
  const cmdDiffSelected = vscode.commands.registerCommand('perforce.shelvedFiles.diffSelected', async (item) => {
    // item may be a tree item label (string) or the item passed by the view
    const strFile = (typeof item === 'string') ? item : (item && item.label) ? item.label : undefined;
    if (!strFile) {
      vscode.window.showInformationMessage('No file selected to diff.');
      return;
    }

    try {
      const perforce = new (await import('./services/PerforceService.js')).PerforceService();
      const treeProvider = shelvedFilesTreeView; // current provider instance
      const cl = (item && item.cl) ? item.cl : treeProvider.getCl();
      if (!cl) {
        vscode.window.showErrorMessage('No changelist loaded in the Shelved Files view.');
        return;
      }

      // Use describe -s -S to find the revision for this file in the CL
      const summary = await perforce.getDescribeSummaryOutput(cl, true);
      const re = new RegExp(`^\\.\\.\\.\\s+(${strFile.replace(/[.*+?^${}()|[\]\\/]/g, r => `\\${r}`)})#(\\d+)\\s+(\\w+)`, 'm');
      const m = summary.match(re);
      if (!m) {
        vscode.window.showErrorMessage(`Could not find revision info for ${strFile} in CL ${cl}.`);
        return;
      }

      const rev = Number(m[2]);
      const fromRev = rev > 1 ? (rev - 1) : 0;

      // Fetch contents for both revisions
      await perforce.ensureAvailable();
      let leftContent = '';
      if (fromRev > 0) {
        leftContent = await perforce.getFileContentAtRevision(strFile, fromRev);
      } else {
        // If rev==1 and it's an add, compare against empty; for others fall back to empty as well.
        leftContent = '';
      }

      const rightContent = await perforce.getFileContentAtRevision(strFile, rev);

      // Normalize EOLs to avoid stray CR characters rendering inline (use LF for both sides)
      const normalize = (s) => (s == null) ? '' : String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const leftText = normalize(leftContent);
      const rightText = normalize(rightContent);

      // Create two untitled documents identified by the depot path + rev (avoid '#' in URI)
      const leftUri = vscode.Uri.parse(`untitled:${strFile}@${fromRev || 'base'}`);
      const rightUri = vscode.Uri.parse(`untitled:${strFile}@${rev}`);

      // Populate content without opening individual editors
      const edit = new vscode.WorkspaceEdit();
      edit.insert(leftUri, new vscode.Position(0, 0), leftText);
      edit.insert(rightUri, new vscode.Position(0, 0), rightText);
      await vscode.workspace.applyEdit(edit);

      // Show diff
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${strFile} — ${fromRev || 'base'} ↔ ${rev}`);
    }
    catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      vscode.window.showErrorMessage(`Diff error: ${msg}`);
    }
  });

  // Enable double-click/selection context menu by wiring view selection to command
  treeView.onDidChangeSelection(e => {
    const sel = e.selection && e.selection[0];
    if (sel && sel.contextValue === 'shelvedFile') {
      // Add a context command to the tree item via the command palette
      // We won't automatically open the diff on selection, but register the command to be run from the context menu.
    }
  });

  context.subscriptions.push(treeView, cmdFetch, cmdDiffSelected);
}

/** Cleanup hook when the extension is deactivated. */
export function deactivate() { }
