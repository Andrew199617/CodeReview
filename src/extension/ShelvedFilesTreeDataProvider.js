import * as vscode from 'vscode';

/**
 * Provides a simple list of shelved files for a changelist as a native TreeView.
 * Call setResults(cl, files) to update the view after fetching data.
 */
export class ShelvedFilesTreeDataProvider
{
  constructor()
  {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._files = [];
    this._cl = undefined;
  }

  /**
   * Replaces the current CL and files and refreshes the view.
   */
  setResults(cl, files)
  {
    this._cl = cl;
    this._files = Array.isArray(files) ? files.slice() : [];
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

  /** Returns child items for the root; renders either a message or the file list. */
  getChildren(element)
  {
    // We don't support nested children; if an element is provided, return empty.
    if (element) {
      return [];
    }

    if (!this._files || this._files.length === 0)
    {
      const label = this._cl ? `No files for CL ${this._cl}` : 'Enter a CL to list shelved files';
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'info';
      item.iconPath = new vscode.ThemeIcon('info');
      return [item];
    }

    return this._files.map((file) =>
    {
      const item = new vscode.TreeItem(file, vscode.TreeItemCollapsibleState.None);
      item.tooltip = file;
      item.description = '';
      item.iconPath = new vscode.ThemeIcon('file');
      item.contextValue = 'shelvedFile';
      return item;
    });
  }

  /** Returns a TreeItem for the provided element. VS Code expects this method. */
  getTreeItem(element)
  {
    // We already return vscode.TreeItem instances from getChildren,
    // so simply return the element if it's a TreeItem, otherwise create one.
    if (!element) return undefined;
    if (element instanceof vscode.TreeItem) return element;
    return new vscode.TreeItem(String(element), vscode.TreeItemCollapsibleState.None);
  }
}
