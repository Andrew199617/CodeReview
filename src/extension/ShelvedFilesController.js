import * as vscode from 'vscode';

/**
 * @description Escapes a string for safe insertion into a RegExp pattern.
 * @param {string} value Raw string to escape.
 * @returns {string} Escaped string safe for new RegExp().
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, (rawChar) => `\\${rawChar}`);
}

/**
 * Coordinates user input and Perforce calls for the Shelved Files view.
 * Prompts for a changelist, fetches shelved files via PerforceService, and updates the tree provider.
 */
export class ShelvedFilesController {
  constructor(tree, perforceService, configService, viewedStateService) {
    this.tree = tree;
    this.perforce = perforceService;
    this.configService = configService;
    this.viewedStateService = viewedStateService;
    vscode.workspace.onDidChangeConfiguration(this.onConfigChange.bind(this));
  }

  /**
   * Handles configuration changes.
   * @param {vscode.ConfigurationChangeEvent} event - The configuration change event.
   */
  onConfigChange(event) {
    if (event.affectsConfiguration('lgd.options.reviewUsers')) {
      const reviewUsers = this.configService.getReviewUsers();
      if (reviewUsers && reviewUsers.length > 0) {
        this.tree.setUsers(reviewUsers);
      }
    }
    else if (event.affectsConfiguration('lgd.options.perforceClient')
      || event.affectsConfiguration('lgd.options.perforceUser')
      || event.affectsConfiguration('lgd.options.perforcePort')) {
      const conn = this.configService.getPerforceConnection();
      this.perforce.updateConnection(conn);
    }
  }

  /**
   * Prompts the user to enter a numeric Perforce changelist and triggers fetch.
   * If the input is cancelled or invalid, nothing is changed.
   */
  async promptAndFetch() {
    const clStr = await vscode.window.showInputBox({
      prompt: 'Enter a Perforce shelved changelist number',
      placeHolder: 'e.g. 1234567',
      validateInput: (v) => (!v || !/^[0-9]+$/.test(v) ? 'Enter a numeric CL' : undefined)
    });

    if (!clStr) {
      return;
    }

    const cl = Number(clStr);
    await this.fetch(cl);
  }

  /**
   * Fetches shelved files for the given changelist using `p4 describe -s -S`.
   * Updates the tree with results or shows an error message on failure.
   */
  async fetch(cl) {
    const progressOptions = { location: vscode.ProgressLocation.Window, title: `Fetching shelved files for CL ${cl}...` };

    try {
      await vscode.window.withProgress(progressOptions, async () => {
        const arrFiles = await this.perforce.getShelvedFilesFromChangelist(cl);
        this.tree.setResults(cl, arrFiles);
      });
    }
    catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      vscode.window.showErrorMessage(`Perforce error: ${msg}`);
      this.tree.setResults(cl, []);
    }
  }

  /**
   * @description Handles diff display for the selected shelved file.
   * @param {any} item Tree item or string label representing a depot path.
   * @returns {Promise<void>} Resolves when diff is shown or an error is reported.
   */
  async diffSelected(item) {
    const depotFilePath = (typeof item === 'string') ? item : (item && item.label) ? item.label : undefined;
    if (!depotFilePath) {
      vscode.window.showInformationMessage('No file selected to diff.');
      return;
    }

    try {
      const changeListNumber = (item && item.cl) ? item.cl : this.tree.getCl();
      if (!changeListNumber) {
        vscode.window.showErrorMessage('No changelist loaded in the Shelved Files view.');
        return;
      }

      const summary = await this.perforce.getDescribeSummaryOutput(changeListNumber, true);
      const revisionRegex = new RegExp(`^\\.\\.\\.\\s+(${escapeRegex(depotFilePath)})#(\\d+)\\s+(\\w+)`, 'm');
      const revisionMatch = summary.match(revisionRegex);
      if (!revisionMatch) {
        vscode.window.showErrorMessage(`Could not find revision info for ${depotFilePath} in CL ${changeListNumber}.`);
        return;
      }

      const revision = Number(revisionMatch[2]);
      const fromRevision = revision > 1 ? (revision - 1) : 0;

      const leftUri = vscode.Uri.parse(`perforce-shelved:${depotFilePath}?rev=${fromRevision || 'base'}`);
      const rightUri = vscode.Uri.parse(`perforce-shelved:${depotFilePath}?rev=${revision}`);

      // Open the diff
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${depotFilePath} — ${fromRevision || 'base'} ↔ ${revision}`);

      // Mark as viewed
      await this.viewedStateService.markAsViewed(changeListNumber, depotFilePath);

      // Refresh tree to update icon
      this.tree.refresh();
    }
    catch (err) {
      const message = (err && err.message) ? err.message : String(err);
      vscode.window.showErrorMessage(`Diff error: ${message}`);
    }
  }
}
