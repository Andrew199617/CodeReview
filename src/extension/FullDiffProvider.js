import * as vscode from 'vscode';
import { normalizeEols } from '../Shared/FsUtils.js';

const SCHEME = 'perforce-rev';

/**
 * @description Provides read-only document content for Perforce depot file revisions.
 * Registers a custom URI scheme so the multi-diff editor can lazily resolve file contents.
 */
export class FullDiffProvider {
  /**
   * @param {import('../Shared/PerforceService.js').PerforceService} perforceService Perforce service for fetching file content.
   */
  constructor(perforceService) {
    /** @type {import('../Shared/PerforceService.js').PerforceService} */
    this._perforce = perforceService;

    /** @type {vscode.EventEmitter<vscode.Uri>} */
    this._onDidChange = new vscode.EventEmitter();

    this.onDidChange = this._onDidChange.event;
  }

  /**
   * @description Called by VS Code to resolve document content for the perforce-rev scheme.
   * Reconstructs the depot path from the URI authority and path, then fetches content via p4 print.
   * @param {vscode.Uri} uri URI with depot path encoded as authority+path and revision in query.
   * @returns {Promise<string>} File content at the specified revision, or empty string for rev 0.
   */
  async provideTextDocumentContent(uri) {
    const revision = Number(new URLSearchParams(uri.query).get('rev') || '0');
    if (revision <= 0) {
      return '';
    }

    const depotPath = `//${uri.authority}${uri.path}`;

    try {
      const content = await this._perforce.getFileContentAtRevision(depotPath, revision);
      return normalizeEols(content);
    }
    catch (err) {
      return '';
    }
  }

  /**
   * @description The URI scheme registered by this provider.
   * @returns {string}
   */
  static get scheme() {
    return SCHEME;
  }

  /**
   * @description Builds a perforce-rev URI for a depot file at a given revision.
   * The depot path is encoded as the URI authority and path so it round-trips cleanly.
   * @param {string} depotPath Depot file path (e.g. //depot/path/file.ext).
   * @param {number} revision File revision number (0 yields empty content).
   * @returns {vscode.Uri}
   */
  static buildUri(depotPath, revision) {
    return vscode.Uri.parse(`${SCHEME}:${depotPath}?rev=${revision}`);
  }
}
