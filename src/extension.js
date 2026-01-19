import * as vscode from 'vscode';
import { PerforceContentProvider } from './extension/PerforceContentProvider.js';
import { ShelvedFilesController } from './extension/ShelvedFilesController.js';
import { ShelvedFilesTreeDataProvider } from './extension/ShelvedFilesTreeDataProvider.js';
import { ConfigService } from './services/ConfigService.js';
import { PerforceService } from './services/PerforceService.js';

/**
 * @description Escapes a string for safe insertion into a RegExp pattern.
 * @description Escapes a string for safe insertion into a RegExp pattern.
 * @param {string} value Raw string to escape.
 * @returns {string} Escaped string safe for new RegExp().
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, (rawChar) => `\\${rawChar}`);
}

/**
 * @description Handles diff display for the selected shelved file.
 * @param {any} item Tree item or string label representing a depot path.
 * @param {ShelvedFilesTreeDataProvider} shelvedFilesTreeView Tree data provider instance.
 * @param {PerforceService} perforceService Service used to query Perforce.
 * @returns {Promise<void>} Resolves when diff is shown or an error is reported.
 */
async function diffSelectedHandler(item, shelvedFilesTreeView, perforceService)
{
  const depotFilePath = (typeof item === 'string') ? item : (item && item.label) ? item.label : undefined;
  if (!depotFilePath)
  {
    vscode.window.showInformationMessage('No file selected to diff.');
    return;
  }

  try
  {
    const changeListNumber = (item && item.cl) ? item.cl : shelvedFilesTreeView.getCl();
    if (!changeListNumber)
    {
      vscode.window.showErrorMessage('No changelist loaded in the Shelved Files view.');
      return;
    }

    const summary = await perforceService.getDescribeSummaryOutput(changeListNumber, true);
    const revisionRegex = new RegExp(`^\\.\\.\\.\\s+(${escapeRegex(depotFilePath)})#(\\d+)\\s+(\\w+)`, 'm');
    const revisionMatch = summary.match(revisionRegex);
    if (!revisionMatch)
    {
      vscode.window.showErrorMessage(`Could not find revision info for ${depotFilePath} in CL ${changeListNumber}.`);
      return;
    }

    const revision = Number(revisionMatch[2]);
    const fromRevision = revision > 1 ? (revision - 1) : 0;

    const leftUri = vscode.Uri.parse(`perforce-shelved:${depotFilePath}?rev=${fromRevision || 'base'}`);
    const rightUri = vscode.Uri.parse(`perforce-shelved:${depotFilePath}?rev=${revision}`);

    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${depotFilePath} — ${fromRevision || 'base'} ↔ ${revision}`);
  }
  catch (err)
  {
    const message = (err && err.message) ? err.message : String(err);
    vscode.window.showErrorMessage(`Diff error: ${message}`);
  }
}

/**
 * @description Refreshes the specified changelist in the shelved files view.
 * @param {any} item Tree item representing the changelist.
 * @param {ShelvedFilesTreeDataProvider} shelvedFilesTreeView Tree data provider instance.
 */
async function refreshChangelist(item, shelvedFilesTreeView)
{
  if (!item || typeof item.cl !== 'number')
  {
    return;
  }

  await vscode.window.withProgress(
    {
      location: { viewId: 'perforce.shelvedFiles' },
      cancellable: false,
      title: `Refreshing CL ${item.cl}`
    },
    async () =>
    {
      await shelvedFilesTreeView.reloadChangelist(item.cl, item.user);
    }
  );
}

/**
 * @description Entry point for the VS Code extension activation. Registers the shelved files view and command handlers.
 * @param {vscode.ExtensionContext} context VS Code extension context.
 * @returns {Promise<void>} Resolves when activation completes.
 */
export async function activate(context)
{
  const configService = new ConfigService();
  const reviewUsers = configService.getReviewUsers();
  const perforceConnection = configService.getPerforceConnection();

  const perforceService = new PerforceService(perforceConnection);
  const shelvedFilesTreeView = new ShelvedFilesTreeDataProvider(reviewUsers, perforceService);
  const treeView = vscode.window.createTreeView('perforce.shelvedFiles', { treeDataProvider: shelvedFilesTreeView, showCollapseAll: false });
  const shelvedFilesTreeController = new ShelvedFilesController(shelvedFilesTreeView, perforceService, configService);

  const contentProvider = new PerforceContentProvider(perforceService);
  const cmdContentProvider = vscode.workspace.registerTextDocumentContentProvider('perforce-shelved', contentProvider);

  const cmdFetch = vscode.commands.registerCommand('perforce.shelvedFiles.find', shelvedFilesTreeController.promptAndFetch);
  const cmdDiffSelected = vscode.commands.registerCommand('perforce.shelvedFiles.diffSelected', async (item) => diffSelectedHandler(item, shelvedFilesTreeView, perforceService));
  const cmdRefreshChangelist = vscode.commands.registerCommand('perforce.shelvedFiles.refreshChangelist', item => refreshChangelist(item, shelvedFilesTreeView));

  await configService.ensureOpenAIConfig();

  context.subscriptions.push(
    treeView,
    cmdFetch,
    cmdDiffSelected,
    cmdRefreshChangelist,
    cmdContentProvider
  );
}

/** @description Cleanup hook when the extension is deactivated. */
export function deactivate() { }
