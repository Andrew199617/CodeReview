import * as vscode from 'vscode';
import { normalizeEols } from '../services/FsUtils.js';

/**
 * @description Provides read-only content from Perforce for a given URI.
 * @implements {vscode.TextDocumentContentProvider}
 */
export class PerforceContentProvider
{
  /**
   * @param {import('../services/PerforceService.js').PerforceService} perforceService The Perforce service instance.
   */
  constructor(perforceService)
  {
    /**
     * @description The Perforce service instance.
     * @type {import('../services/PerforceService.js').PerforceService}
     */
    this._perforceService = perforceService;
  }

  /**
   * @description Provide textual content for a given uri.
   * @param {vscode.Uri} uri The uri for which to provide content.
   * @returns {Promise<string>} The textual content of the file.
   */
  async provideTextDocumentContent(uri)
  {
    try
    {
      const depotPath = uri.authority ? `//${uri.authority}${uri.path}` : uri.path;
      const params = new URLSearchParams(uri.query);
      const revision = params.get('rev');

      if (!revision)
      {
        return 'Error: No revision specified in URI.';
      }

      if (revision === '0' || revision === 'base')
      {
        return '';
      }

      const content = await this._perforceService.getFileContentAtRevision(depotPath, revision);

      return normalizeEols(content);
    }
    catch (err)
    {
      return `Error loading file from Perforce: ${err?.message || String(err)}`;
    }
  }
}
