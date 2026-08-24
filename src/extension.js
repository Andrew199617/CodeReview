import * as vscode from 'vscode';
import { diffAllFilesHandler, diffSelectedFileHandler } from './DiffEditor/DiffHandler.js';
import { PerforceContentProvider } from './extension/PerforceContentProvider.js';
import { ShelvedFilesController } from './extension/ShelvedFilesController.js';
import { ShelvedFilesTreeDataProvider } from './extension/ShelvedFilesTreeDataProvider.js';
import { ConfigService } from './Shared/ConfigService.js';
import { PerforceService } from './Shared/PerforceService.js';
import { ViewedStateService } from './Shared/ViewedStateService.js';

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

  const viewedStateService = new ViewedStateService(context.workspaceState);
  const shelvedFilesTreeView = new ShelvedFilesTreeDataProvider(reviewUsers, perforceService, viewedStateService, configService);
  const treeView = vscode.window.createTreeView('perforce.shelvedFiles', { treeDataProvider: shelvedFilesTreeView, showCollapseAll: false });
  const shelvedFilesTreeController = new ShelvedFilesController(shelvedFilesTreeView, perforceService, configService, viewedStateService);

  const contentProvider = new PerforceContentProvider(perforceService);
  const cmdContentProvider = vscode.workspace.registerTextDocumentContentProvider('perforce-shelved', contentProvider);

  await configService.ensureOpenAIConfig();

  const cmdFetch = vscode.commands.registerCommand('perforce.shelvedFiles.find', shelvedFilesTreeController.promptAndFetch);
  const cmdDiffSelected = vscode.commands.registerCommand('perforce.shelvedFiles.diffSelected', (item) => diffSelectedFileHandler(item, shelvedFilesTreeView, perforceService));
  const cmdDiffAll = vscode.commands.registerCommand('perforce.shelvedFiles.diffAll', (item) => diffAllFilesHandler(item, shelvedFilesTreeView, perforceService));
  const cmdRefreshChangelist = vscode.commands.registerCommand('perforce.shelvedFiles.refreshChangelist', item => shelvedFilesTreeController.refreshChangelist(item));
  const cmdRetryLoadUser = vscode.commands.registerCommand('perforce.shelvedFiles.retryLoadUser', item => shelvedFilesTreeController.retryLoadUser(item));

  await configService.ensureOpenAIConfig();

  context.subscriptions.push(
    treeView,
    cmdContentProvider,
    cmdFetch,
    cmdDiffSelected,
    cmdDiffAll,
    cmdRefreshChangelist,
    cmdRetryLoadUser
  );
}

/** @description Cleanup hook when the extension is deactivated. */
export function deactivate() { }
