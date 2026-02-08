import * as vscode from 'vscode';

/**
 * @description Manages the "viewed" state of files within changelists.
 * Persists the state so users can see what they have already reviewed.
 */
export class ViewedStateService {
  /**
   * @param {vscode.Memento} storage The storage mechanism (usually context.workspaceState).
   */
  constructor(storage) {
    /** @type {vscode.Memento} */
    this._storage = storage;
    this._keyPrefix = 'viewed_files_';
  }

  /**
   * @description Marks a file as viewed for a specific changelist.
   * @param {number} changelistNum The changelist number.
   * @param {string} depotPath The depot path of the file.
   * @returns {Promise<void>} A promise that resolves when the state is saved.
   */
  async markAsViewed(changelistNum, depotPath) {
    if (!changelistNum || !depotPath) {
      return;
    }

    const key = this._getStorageKey(changelistNum);
    const currentSet = this._getViewedSet(key);

    if (!currentSet.has(depotPath)) {
      currentSet.add(depotPath);
      await this._storage.update(key, Array.from(currentSet));
    }
  }

  /**
   * @description Checks if a file is marked as viewed.
   * @param {number} changelistNum The changelist number.
   * @param {string} depotPath The depot path of the file.
   * @returns {boolean} True if the file has been viewed; otherwise, false.
   */
  isViewed(changelistNum, depotPath) {
    if (!changelistNum || !depotPath) {
      return false;
    }

    const key = this._getStorageKey(changelistNum);
    const currentSet = this._getViewedSet(key);
    return currentSet.has(depotPath);
  }

  /**
   * @description Clears the viewed state for an entire changelist.
   * @param {number} changelistNum The changelist number to clear.
   * @returns {Promise<void>} A promise that resolves when the state is cleared.
   */
  async clearViewedState(changelistNum) {
    if (!changelistNum) {
      return;
    }

    const key = this._getStorageKey(changelistNum);
    await this._storage.update(key, undefined);
  }

  /**
   * @description Generates the storage key for a changelist's viewed files.
   * @param {number} changelistNum The changelist number.
   * @returns {string} The storage key.
   */
  _getStorageKey(changelistNum) {
    return `${this._keyPrefix}${changelistNum}`;
  }

  /**
   * @description Retrieves the Set of viewed files from storage.
   * @param {string} key The storage key.
   * @returns {Set<string>} A Set containing the viewed file paths.
   */
  _getViewedSet(key) {
    const rawList = this._storage.get(key);
    if (Array.isArray(rawList)) {
      return new Set(rawList);
    }

    return new Set();
  }
}
