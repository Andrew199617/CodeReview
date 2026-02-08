import * as vscode from 'vscode';
import { FullDiffProvider } from '../extension/FullDiffProvider.js';
import { escapeRegex } from '../Polyfill/Regex.js';


/**
 * @description Handles diff display for the selected shelved file.
 * @param {any} item Tree item or string label representing a depot path.
 * @param {ShelvedFilesTreeDataProvider} shelvedFilesTreeView Tree data provider instance.
 * @param {PerforceService} perforceService Service used to query Perforce.
 * @returns {Promise<void>} Resolves when diff is shown or an error is reported.
 */
export async function diffSelectedFileHandler(item, shelvedFilesTreeView, perforceService) {
  const depotFilePath = (typeof item === 'string') ? item : (item && item.label) ? item.label : undefined;
  if (!depotFilePath) {
    vscode.window.showInformationMessage('No file selected to diff.');
    return;
  }

  try {
    const changeListNumber = (item && item.cl) ? item.cl : shelvedFilesTreeView.getCl();
    if (!changeListNumber) {
      vscode.window.showErrorMessage('No changelist loaded in the Shelved Files view.');
      return;
    }

    const summary = await perforceService.getDescribeSummaryOutput(changeListNumber, true);
    const revisionRegex = new RegExp(`^\\.\\.\\.\\s+(${escapeRegex(depotFilePath)})#(\\d+)\\s+(\\w+)`, 'm');
    const revisionMatch = summary.match(revisionRegex);
    if (!revisionMatch) {
      vscode.window.showErrorMessage(`Could not find revision info for ${depotFilePath} in CL ${changeListNumber}.`);
      return;
    }

    const revision = Number(revisionMatch[2]);
    const fromRevision = revision > 1 ? (revision - 1) : 0;

    const leftUri = vscode.Uri.parse(`untitled:${depotFilePath}@${fromRevision || 'base'}`);
    const rightUri = vscode.Uri.parse(`untitled:${depotFilePath}@${revision}`);

    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${depotFilePath} — ${fromRevision || 'base'} ↔ ${revision}`);
  }
  catch (err) {
    const message = (err && err.message) ? err.message : String(err);
    vscode.window.showErrorMessage(`Diff error: ${message}`);
  }
}


/**
 * @description Opens a multi-diff editor showing all file changes in the changelist.
 * Fetches revision info from Perforce describe and builds URI pairs for vscode.changes.
 * @param {any} item Tree item representing the changelist node.
 * @param {ShelvedFilesTreeDataProvider} shelvedFilesTreeView Tree data provider instance.
 * @param {PerforceService} perforceService Service used to query Perforce.
 * @returns {Promise<void>}
 */
export async function diffAllFilesHandler(item, shelvedFilesTreeView, perforceService) {
  if (!item || typeof item.cl !== 'number') {
    return;
  }

  const changelistNumber = item.cl;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
      title: `Loading all diffs for CL ${changelistNumber}\u2026`
    },
    async () => {
      const files = await shelvedFilesTreeView.getFilesForChangelist(changelistNumber, item.user);
      if (!files || files.length === 0) {
        vscode.window.showInformationMessage(`No files found in CL ${changelistNumber}.`);
        return;
      }

      const isShelved = shelvedFilesTreeView.isPendingChangelist(changelistNumber);
      const summary = await perforceService.getDescribeSummaryOutput(changelistNumber, isShelved);

      const changes = buildChangesFromSummary(files, summary);
      if (changes.length === 0) {
        vscode.window.showInformationMessage(`Could not resolve revision info for files in CL ${changelistNumber}.`);
        return;
      }

      await vscode.commands.executeCommand('vscode.changes', `CL ${changelistNumber}`, changes);
    }
  );
}



/**
 * @description Parses a p4 describe summary and builds label/original/modified URI triples.
 * @param {string[]} files Array of depot file paths.
 * @param {string} summary Output from p4 describe -s.
 * @returns {[vscode.Uri, vscode.Uri, vscode.Uri][]} Array of [label, original, modified] tuples.
 */
function buildChangesFromSummary(files, summary) {
  const changes = [];

  for (const depotFilePath of files) {
    const revisionRegex = new RegExp(`^\\.\\.\\.\\s+(${escapeRegex(depotFilePath)})#(\\d+)\\s+(\\w+)`, 'm');
    const revisionMatch = summary.match(revisionRegex);
    if (!revisionMatch) {
      continue;
    }

    const revision = Number(revisionMatch[2]);
    const fromRevision = revision > 1 ? (revision - 1) : 0;

    const labelUri = FullDiffProvider.buildUri(depotFilePath, revision);
    const originalUri = FullDiffProvider.buildUri(depotFilePath, fromRevision);
    const modifiedUri = FullDiffProvider.buildUri(depotFilePath, revision);

    changes.push([labelUri, originalUri, modifiedUri]);
  }

  return changes;
}