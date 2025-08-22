import * as vscode from 'vscode';

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
export class ShelvedFilesTreeDataProvider
{
  /**
   * @param {string[]} reviewUsers The users to shelve files for.
   */
  constructor(reviewUsers, perforceService)
  {
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
    this._userClMap = new Map(); // user -> number[]
    this._clFilesMap = new Map(); // cl -> string[]

    this._perforce = perforceService;

    if (reviewUsers.length > 0) {
      this.setUsers(reviewUsers);
    }
  }

  /**
   * Replaces the current CL and files and refreshes the view.
   */
  setResults(cl, files)
  {
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
    this._clFilesMap.clear();
    this._cl = undefined;
    this._files = [];
    this._onDidChangeTreeData.fire();
  }

  /** Returns the current changelist number (or undefined). */
  getCl()
  {
    return this._cl;
  }

  /** Returns a shallow copy of the current file list. */
  getFiles()
  {
    return this._files.slice();
  }

  /** Forces a refresh of the view without changing the data. */
  refresh()
  {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Returns child items for the given element.
   * - Root: Users or legacy flat file list depending on mode.
   * - User: Shelved changelists for that user.
   * - Changelist: Shelved files.
   * @param {vscode.TreeItem | undefined} element The parent element or undefined for root.
   * @returns {Promise<vscode.TreeItem[]>} Child items.
   */
  async getChildren(element)
  {
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
    if (!this._files || this._files.length === 0)
    {
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
    let arrChangelists = this._userClMap.get(user);

    if (!arrChangelists) {
      arrChangelists = await this._fetchUserChangelists(user);
      this._userClMap.set(user, arrChangelists);
    }

    if (!arrChangelists || arrChangelists.length === 0) {
      return [this._createInfoItem(`No pending changelists for ${user}`)];
    }

    return arrChangelists.map((changelist) => {
      const label = `CL ${changelist}`;
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
      item.tooltip = `${user} — ${label}`;
      item.description = user;
      item.iconPath = new vscode.ThemeIcon('git-commit');
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
    let arrFiles = this._clFilesMap.get(changelist);

    if (!arrFiles) {
      arrFiles = await this._fetchShelvedFiles(changelist);
      this._clFilesMap.set(changelist, arrFiles);
    }

    if (!arrFiles || arrFiles.length === 0) {
      return [this._createInfoItem(`No shelved files in CL ${changelist}`)];
    }

    return this._toFileItems(arrFiles, changelist, element.user);
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
    return arrFiles.map((file) =>
    {
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
   * Loads the list of shelved changelists for a user via Perforce.
   * @param {string} user Perforce user.
   * @returns {Promise<number[]>}
   */
  async _fetchUserChangelists(user) {
    try {
      const arrCls = await this._perforce.getPendingChangelistsForUser(user);
      return arrCls;
    }
    catch (err) {
      vscode.window.showErrorMessage(`Perforce error loading changelists for ${user}: ${err?.message || String(err)}`);
      return [];
    }
  }

  /**
   * Loads the list of shelved files for a changelist via Perforce.
   * @param {number} cl Changelist number.
   * @returns {Promise<string[]>}
   */
  async _fetchShelvedFiles(cl) {
    try {
      const arrFiles = await this._perforce.getShelvedFilesFromChangelist(cl);
      return arrFiles;
    }
    catch (err) {
      vscode.window.showErrorMessage(`Perforce error loading shelved files for CL ${cl}: ${err?.message || String(err)}`);
      return [];
    }
  }

  /**
   * Creates a simple non-collapsible informational TreeItem.
   * @param {string} label Label to display.
   * @returns {vscode.TreeItem}
   */
  _createInfoItem(label)
  {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'info';
    item.iconPath = new vscode.ThemeIcon('info');
    return item;
  }
}
