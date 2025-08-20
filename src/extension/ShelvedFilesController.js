import * as vscode from 'vscode';
import { PerforceService } from '../services/PerforceService.js';

/**
 * Coordinates user input and Perforce calls for the Shelved Files view.
 * Prompts for a changelist, fetches shelved files via PerforceService, and updates the tree provider.
 */
export class ShelvedFilesController {
  constructor(tree) {
    this.tree = tree;
    this.perforce = new PerforceService();
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
