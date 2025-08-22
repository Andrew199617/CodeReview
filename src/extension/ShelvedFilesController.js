import * as vscode from 'vscode';

/**
 * Coordinates user input and Perforce calls for the Shelved Files view.
 * Prompts for a changelist, fetches shelved files via PerforceService, and updates the tree provider.
 */
export class ShelvedFilesController {
  constructor(tree, perforceService, configService) {
    this.tree = tree;
    this.perforce = perforceService;
    this.configService = configService;
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
}
