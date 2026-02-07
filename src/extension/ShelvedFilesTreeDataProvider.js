import * as vscode from 'vscode';
import { ChangeListInfo, SubmitStates } from '../Shared/ChangeListInfo.js';

/**
 * Context values for tree items.
 */
const ContextValue = {
  USERS: 'user',
  CHANGELIST: 'changelist',
  CHOSEN: 'cl'
}

/**
 * Provides a simple list of shelved files for a changelist as a native TreeView.
 * Call setResults(cl, files) to update the view after fetching data.
 */
export class ShelvedFilesTreeDataProvider {
  /**
   * @param {string[]} reviewUsers The users to shelve files for.
   * @param {PerforceService} perforceService The Perforce service instance to use for fetching data.
   */
  constructor(reviewUsers, perforceService) {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;

    // Mode "cl" keeps backward-compat behavior for the manual Find CL command.
    // Mode "users" renders a hierarchy: Users -> Changelists -> Files.
    this._mode = ContextValue.USERS;

    // Legacy single-CL state
    this._files = [];
    this._cl = undefined;

    // Users/changelists/files state
    this._users = [];

    /**
     * @description Map of user -> changelist numbers.
     * @type {Map<string, number[]>}
     */
    this._userClMap = new Map();

    /**
     * @description Map of changelist number -> info object.
     * { description: string, files?: string[] }
     * Files are populated lazily on expansion of a changelist node to avoid extra p4 calls.
     * @type {Map<number, ChangeListInfo>}
     */
    this._clInfoMap = new Map();

    /**
     * @description Map of user -> last load error message when changelists failed to load.
     * @type {Map<string, string>}
     */
    this._userLoadErrorMap = new Map();

    this._perforce = perforceService;

    if (reviewUsers.length > 0) {
      this.setUsers(reviewUsers);
    }
  }

  /**
   * Replaces the current CL and files and refreshes the view.
   */
  setResults(cl, files) {
    this._mode = 'cl';
    this._cl = cl;
    this._files = Array.isArray(files) ? files.slice() : [];
    this._onDidChangeTreeData.fire();
  }

  /** Seeds the provider with users from env (comma-separated). */
  setUsers(arrUsers) {
    this._mode = ContextValue.USERS;
    this._users = Array.isArray(arrUsers) ? arrUsers.filter((u) => !!u).map((u) => String(u).trim()).filter((u) => u.length > 0) : [];
    this._userClMap.clear();
    this._clInfoMap.clear();
    this._userLoadErrorMap.clear();
    this._cl = undefined;
    this._files = [];
    this._onDidChangeTreeData.fire();
  }

  /** Returns the current changelist number (or undefined). */
  getCl() {
    return this._cl;
  }

  /** Returns a shallow copy of the current file list. */
  getFiles() {
    return this._files.slice();
  }

  /** Forces a refresh of the view without changing the data. */
  refresh() {
    this._onDidChangeTreeData.fire();
  }

  /**
   * @description Clears cached changelist state for a user and refreshes so data can be loaded again.
   * @param {string} user User to retry loading changelists for.
   */
  retryLoadUser(user) {
    if (!user) {
      return;
    }

    const cachedChangelists = this._userClMap.get(user) || [];
    for (const changelistNumber of cachedChangelists) {
      this._clInfoMap.delete(changelistNumber);
    }

    this._userClMap.delete(user);
    this._userLoadErrorMap.delete(user);
    this.refresh();
  }

  /**
   * @description Returns the files for a changelist, loading them if not already cached.
   * @param {number} changelistNumber Changelist number.
   * @param {string|undefined} user User who owns the changelist.
   * @returns {Promise<string[]>} Array of depot file paths.
   */
  async getFilesForChangelist(changelistNumber, user) {
    await this._ensureChangelistFilesLoaded(changelistNumber, user);

    const info = this._clInfoMap.get(changelistNumber);
    if (!info || !Array.isArray(info.files)) {
      return [];
    }

    return info.files.slice();
  }

  /**
   * @description Returns whether the changelist is pending (shelved) rather than submitted.
   * @param {number} changelistNumber Changelist number.
   * @returns {boolean}
   */
  isPendingChangelist(changelistNumber) {
    const info = this._clInfoMap.get(changelistNumber);
    return !info || info.submitState === SubmitStates.PENDING;
  }

  /**
   * @description Clears cached files for a changelist so that they are re-fetched next access.
   * @param {number} changelistNumber Changelist to clear.
   */
  clearChangelistFiles(changelistNumber) {
    const info = this._clInfoMap.get(changelistNumber);
    if (info && info.files) {
      delete info.files;
    }
  }

  /**
   * @description Force reload of a changelist's files and refresh the tree.
   * @param {number} changelistNumber Changelist number.
   * @param {string|undefined} user Optional user (optimizes batch load).
   * @returns {Promise<void>}
   */
  async reloadChangelist(changelistNumber, user) {
    this.clearChangelistFiles(changelistNumber);
    await this._ensureChangelistFilesLoaded(changelistNumber, user);
    this.refresh();
  }

  /**
   * Returns child items for the given element.
   * - Root: Users or legacy flat file list depending on mode.
   * - User: Shelved changelists for that user.
   * - Changelist: Shelved files.
   * @param {vscode.TreeItem | undefined} element The parent element or undefined for root.
   * @returns {Promise<vscode.TreeItem[]>} Child items.
   */
  async getChildren(element) {
    if (!element) {
      if (this._mode === ContextValue.CHOSEN) {
        return await this._getChosenCLChildren();
      }

      return await this._getUsersFromSettings();
    }

    if (element.contextValue === ContextValue.USERS) {
      return await this._getUserChangelists(element);
    }

    if (element.contextValue === ContextValue.CHANGELIST) {
      return await this._getChangelistsChildren(element);
    }

    return [];
  }

  /**
   * Root children for when user chooses the CL.
   * @returns {Promise<vscode.TreeItem[]>}
   */
  async _getChosenCLChildren() {
    if (!this._files || this._files.length === 0) {
      const label = this._cl ? `No files for CL ${this._cl}` : 'Enter a CL to list shelved files';
      return [this._createInfoItem(label)];
    }

    return this._toFileItems(this._files, this._cl, undefined);
  }

  /**
   * Root children for users mode: the configured list of users.
   * @returns {Promise<vscode.TreeItem[]>}
   */
  async _getUsersFromSettings() {
    if (!this._users || this._users.length === 0) {
      return [this._createInfoItem('No users configured. Set perforce.reviewUsers in settings')];
    }

    return this._users.map((user) => {
      const item = new vscode.TreeItem(user, vscode.TreeItemCollapsibleState.Collapsed);
      item.tooltip = user;
      item.description = '';
      item.iconPath = new vscode.ThemeIcon('account');
      item.contextValue = 'user';
      item.user = user;
      return item;
    });
  }

  /**
   * Children under a user node: that user's shelved changelists.
   * @param {vscode.TreeItem & { user: string }} element User node.
   * @returns {Promise<vscode.TreeItem[]>}
   */
  async _getUserChangelists(element) {
    const user = element.user;
    let changelistInfos = this._userClMap.get(user);
    if (!changelistInfos) {
      try {
        const infos = await this._perforce.getChangeListInfoForUser(user);
        changelistInfos = infos.map((i) => i.changelistNumber);
        this._userClMap.set(user, changelistInfos);
        this._userLoadErrorMap.delete(user);

        for (const info of infos) {
          this._clInfoMap.set(info.changelistNumber, info);
        }
      }
      catch (err) {
        this._userLoadErrorMap.set(user, err?.message || String(err));
        return [this._createRetryItem(user)];
      }
    }

    if (this._userLoadErrorMap.has(user) && (!changelistInfos || changelistInfos.length === 0)) {
      return [this._createRetryItem(user)];
    }

    if (!changelistInfos || changelistInfos.length === 0) {
      return [this._createInfoItem(`No pending changelists for ${user}`)];
    }

    return changelistInfos.map((changelist) => {
      const info = this._clInfoMap.get(changelist) || { description: '' };
      const fullDesc = info.description || '';
      const firstLine = fullDesc.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
      const truncated = firstLine.length > 60 ? firstLine.slice(0, 57) + '…' : firstLine;

      const tooltipLines = [`${user} — CL ${changelist}`];
      if (info.date) {
        tooltipLines.push(`Date: ${info.date}`);
      }
      if (info.submitState) {
        tooltipLines.push(`State: ${info.submitState === SubmitStates.PENDING ? 'Pending' : 'Submitted'}`);
      }
      if (fullDesc.trim().length > 0) {
        tooltipLines.push('', fullDesc.trim());
      }

      const label = truncated ? `CL ${changelist}: ${truncated}` : `CL ${changelist}`;
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
      item.tooltip = tooltipLines.join('\n');
      item.description = user;

      if (info.submitState === SubmitStates.PENDING) {
        item.iconPath = new vscode.ThemeIcon('git-commit', new vscode.ThemeColor('gitDecoration.untrackedResourceForeground'));
      }
      else if (info.submitState === SubmitStates.SUBMITTED) {
        item.iconPath = new vscode.ThemeIcon('git-commit', new vscode.ThemeColor('gitDecoration.ignoredResourceForeground'));
      }

      item.contextValue = 'changelist';
      item.user = user;
      item.cl = changelist;
      item.id = `${user}:${changelist}`;
      return item;
    });
  }

  /**
   * Children under a changelist node: the shelved files in that changelist.
   * @param {vscode.TreeItem & { cl: number, user?: string }} element Changelist node.
   * @returns {Promise<vscode.TreeItem[]>}
   */
  async _getChangelistsChildren(element) {
    const changelist = element.cl;
    await this._ensureChangelistFilesLoaded(changelist, element.user);
    const info = this._clInfoMap.get(changelist);
    if (!info || !info.files || info.files.length === 0) {
      return [this._createInfoItem(`No shelved files in CL ${changelist}`)];
    }

    return this._toFileItems(info.files, changelist, element.user);
  }

  /**
   * @description Ensures shelved file list is loaded for the given changelist. Attempts a batch fetch for all of the user's changelists first, then falls back to a single fetch.
   * @param {number} changelist Changelist number.
   * @param {string|undefined} user User who owns the changelist.
   * @returns {Promise<void>}
   */
  async _ensureChangelistFilesLoaded(changelistNumber, user) {
    if (this._hasFilesLoaded(changelistNumber)) {
      return;
    }

    if (user) {
      await this._loadAllFilesForUser(user);
      if (this._hasFilesLoaded(changelistNumber)) {
        return;
      }
    }

    await this._loadFilesForSingleChangelist(changelistNumber);
  }

  /**
   * @description Returns true if files are already loaded for the changelist.
   * @param {number} changelistNumber Changelist number.
   * @returns {boolean}
   */
  _hasFilesLoaded(changelistNumber) {
    const info = this._clInfoMap.get(changelistNumber);
    return !!(info && Array.isArray(info.files));
  }

  /**
   * @description Attempts to batch load missing shelved/submitted files for all of a user's changelists.
   * @param {string} user User to batch load for.
   * @returns {Promise<void>}
   */
  async _loadAllFilesForUser(user) {
    const changelistNumbers = this._userClMap.get(user);
    if (!Array.isArray(changelistNumbers) || changelistNumbers.length === 0) {
      return;
    }

    const missing = changelistNumbers.filter((changelistNumber) => {
      const info = this._clInfoMap.get(changelistNumber);
      return !info || !Array.isArray(info.files);
    });

    if (missing.length === 0) {
      return;
    }

    try {
      const pendingList = [];
      const submittedList = [];
      for (const changelistNumber of missing) {
        const info = this._clInfoMap.get(changelistNumber);
        if (info && info.submitState === SubmitStates.PENDING) {
          pendingList.push(changelistNumber);
        }
        else {
          submittedList.push(changelistNumber);
        }
      }

      const mapShelved = pendingList.length > 0 ? await this._perforce.getShelvedFilesFromChangelists(pendingList) : new Map();
      const mapSubmitted = submittedList.length > 0 ? await this._perforce.getSubmittedFilesFromChangelists(submittedList) : new Map();

      for (const changelistNumber of missing) {
        const info = this._clInfoMap.get(changelistNumber);
        if (!info) {
          continue;
        }

        if (mapShelved.has(changelistNumber)) {
          info.files = mapShelved.get(changelistNumber);
        }
        else if (mapSubmitted.has(changelistNumber)) {
          info.files = mapSubmitted.get(changelistNumber);
        }
      }
    }
    catch (err) {
      vscode.window.showErrorMessage(`Perforce error loading shelved files (batch) for user ${user}: ${err?.message || String(err)}`);
    }
  }

  /**
   * @description Loads files for a single changelist if still missing after any batch attempt.
   * @param {number} changelistNumber Changelist number.
   * @returns {Promise<void>}
   */
  async _loadFilesForSingleChangelist(changelistNumber) {
    const info = this._clInfoMap.get(changelistNumber);
    if (!info || info.files) {
      return;
    }
    try {
      if (info.submitState === SubmitStates.PENDING) {
        info.files = await this._perforce.getShelvedFilesFromChangelist(changelistNumber);
      }
      else {
        const submittedMap = await this._perforce.getSubmittedFilesFromChangelists([changelistNumber]);
        if (submittedMap.has(changelistNumber)) {
          info.files = submittedMap.get(changelistNumber);
        }
      }
    }
    catch (err) {
      vscode.window.showErrorMessage(`Perforce error loading shelved files for CL ${changelistNumber}: ${err?.message || String(err)}`);
    }
  }

  /**
   * @description Returns a TreeItem for the provided element.
   * VS Code calls this to resolve presentation details for each node.
   * @param {any} element The element returned from getChildren.
   * @returns {vscode.TreeItem | undefined}
   */
  getTreeItem(element) {
    if (!element) {
      return undefined;
    }

    if (element instanceof vscode.TreeItem) {
      return element;
    }

    return new vscode.TreeItem(String(element), vscode.TreeItemCollapsibleState.None);
  }

  /**
   * Converts an array of files into leaf TreeItems and attaches metadata.
   * @param {string[]} arrFiles Array of depot paths.
   * @param {number|undefined} cl Changelist number.
   * @param {string|undefined} user User name.
   * @returns {vscode.TreeItem[]}
   */
  _toFileItems(arrFiles, cl, user) {
    return arrFiles.map((file) => {
      const item = new vscode.TreeItem(file, vscode.TreeItemCollapsibleState.None);
      item.tooltip = file;
      item.description = '';
      item.iconPath = new vscode.ThemeIcon('file');
      item.contextValue = 'shelvedFile';
      item.cl = cl;
      item.user = user;
      return item;
    });
  }

  /**
   * Creates a simple non-collapsible informational TreeItem.
   * @param {string} label Label to display.
   * @returns {vscode.TreeItem}
   */
  _createInfoItem(label) {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'info';
    item.iconPath = new vscode.ThemeIcon('info');
    return item;
  }

  /**
   * Creates a retry item shown when user changelists fail to load.
   * @param {string} user User that failed to load.
   * @returns {vscode.TreeItem}
   */
  _createRetryItem(user) {
    const item = new vscode.TreeItem('Retry', vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'retryUserLoad';
    item.iconPath = new vscode.ThemeIcon('refresh');

    const errorMessage = this._userLoadErrorMap.get(user);
    let tooltip = `Failed to load changelists for ${user}. Click to retry.`;

    if (errorMessage) {
      tooltip = `${tooltip} Last error: ${errorMessage}`;
      item.description = errorMessage;
    }

    item.tooltip = tooltip;
    item.user = user;
    item.command = {
      command: 'perforce.shelvedFiles.retryLoadUser',
      title: 'Retry Load User Changelists',
      arguments: [item]
    };
    return item;
  }
}
