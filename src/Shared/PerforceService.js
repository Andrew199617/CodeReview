import { execa } from 'execa';
import * as vscode from 'vscode';
import { ChangeListInfo, SubmitStates } from './ChangeListInfo.js';

/**
 * @description Thin wrapper around the Perforce `p4` CLI used by the tools and the VS Code extension. Provides helpers to check availability, describe changelists, and retrieve diffs.
 */
export class PerforceService {
  /**
   * @description Creates a new PerforceService instance with optional initial connection settings.
   * @param {Object} [connection] Optional connection object containing client, user, and port.
   * @param {string} [connection.client] Perforce client (workspace) name.
   * @param {string} [connection.user] Perforce user (P4USER).
   * @param {string} [connection.port] Perforce port (P4PORT).
   */
  constructor(connection) {
    /** @type {string|undefined} */
    this._client = connection && connection.client ? String(connection.client).trim() : undefined;
    /** @type {string|undefined} */
    this._user = connection && connection.user ? String(connection.user).trim() : undefined;
    /** @type {string|undefined} */
    this._port = connection && connection.port ? String(connection.port).trim() : undefined;
  }

  /**
   * @description Updates connection properties (client, user, port) at runtime if provided.
   * @param {Object} connection Connection object that may contain client, user, and/or port.
   * @param {string} [connection.client] Perforce client.
   * @param {string} [connection.user] Perforce user.
   * @param {string} [connection.port] Perforce port.
   * @returns {void}
   */
  updateConnection(connection) {
    if (!connection || typeof connection !== 'object') {
      return;
    }

    if (connection.client) this.setClient(connection.client);
    if (connection.user) this.setUser(connection.user);
    if (connection.port) this.setPort(connection.port);
  }

  /**
   * @description Sets the Perforce client to use for subsequent commands.
   * @param {string} client The client/workspace name.
   */
  setClient(client) {
    this._client = typeof client === 'string' && client.trim().length > 0 ? client.trim() : undefined;
  }

  /**
   * @description Returns the active Perforce client value (may be undefined).
   * @returns {string|undefined}
   */
  getClient() {
    return this._client;
  }

  /** @description Sets Perforce user (P4USER). */
  setUser(user) {
    this._user = typeof user === 'string' && user.trim().length > 0 ? user.trim() : undefined;
  }

  /** @returns {string|undefined} Active Perforce user. */
  getUser() {
    return this._user;
  }

  /** @description Sets Perforce port (P4PORT). */
  setPort(port) {
    this._port = typeof port === 'string' && port.trim().length > 0 ? port.trim() : undefined;
  }

  /** @returns {string|undefined} Active Perforce port. */
  getPort() {
    return this._port;
  }

  /**
   * @description Build p4 command arguments including -c <client> if a client is configured.
   * @param {string[]} baseArgs Base p4 subcommand + args.
   * @returns {string[]} Fully constructed args array.
   */
  _buildArgs(baseArgs) {
    if (this.settingIsValid(this._client)) {
      baseArgs = ['-c', this._client, ...baseArgs];
    }

    if (this.settingIsValid(this._user)) {
      baseArgs = ['-u', this._user, ...baseArgs];
    }

    if (this.settingIsValid(this._port)) {
      baseArgs = ['-p', this._port, ...baseArgs];
    }

    return baseArgs.slice();
  }

  /**
   * @description Executes a command and returns stdout. Throws on non-zero exit code.
   * @param {string} strCmd Executable to run.
   * @param {string[]} arrArgs Arguments to pass to the executable.
   * @returns {Promise<string>} Resolves with stdout text.
   */
  async run(strCmd, arrArgs) {
    const { stdout } = await execa(strCmd, arrArgs);

    if (true) {
      console.log(`Running command: ${strCmd} ${arrArgs.join(' ')}`);
      console.log(`Output: ${stdout}`);
    }

    return stdout;
  }

  /**
   * @description Checks if a setting value is valid (non-empty and not the string "none").
   * @param {string|undefined} settingValue Value to validate.
   * @returns {boolean} True if valid, otherwise false.
   */
  settingIsValid(settingValue) {
    if (typeof settingValue !== 'string') {
      return false;
    }

    const trimmed = settingValue.trim();
    return trimmed.length > 0 && trimmed.toLowerCase() !== 'none';
  }

  /** Ensures `p4` is available by executing `p4 -V`. */
  async _ensureAvailable() {
    const p4Available = await this.run('p4', ['-V']);
    return p4Available.includes('Perforce - The Fast Software Configuration Management System');
  }

  /** Returns a list of depot files from `p4 describe -s <cl>`. */
  async getChangelistFiles(changelistNumber) {
    if (!await this._ensureAvailable()) {
      return [];
    }

    const strOut = await this.run('p4', this._buildArgs(['describe', '-s', String(changelistNumber)]));
    const arrLines = strOut.split(/\r?\n/);
    const arrFiles = [];
    let bInFiles = false;

    for (const strLine of arrLines) {
      if (strLine.startsWith('Affected files ...')) {
        bInFiles = true;
        continue;
      }

      if (!bInFiles) {
        continue;
      }

      if (!strLine.trim()) {
        break;
      }

      const match = strLine.match(/^\.\.\.\s+([^#\s]+)#\d+\s+\w+/);
      if (match) {
        arrFiles.push(this.sanitizeDepotPath(match[1]));
      }
    }

    return arrFiles;
  }

  /** Returns full `p4 describe -du [-S] <cl>` output for diffs. */
  async getDescribeOutput(changelistNumber, bShelved) {
    if (!await this._ensureAvailable()) {
      return '';
    }

    const arrArgs = ['describe', '-du'];
    if (bShelved) {
      arrArgs.push('-S');
    }

    arrArgs.push(String(changelistNumber));
    return await this.run('p4', this._buildArgs(arrArgs));
  }

  /** Returns summary `p4 describe -s [-S] <cl>` output for parsing files and revs. */
  async getDescribeSummaryOutput(changelistNumber, bShelved = false) {
    if (!await this._ensureAvailable()) {
      return '';
    }

    const arrArgs = ['describe', '-s'];
    if (bShelved) {
      arrArgs.push('-S');
    }

    arrArgs.push(String(changelistNumber));
    return await this.run('p4', this._buildArgs(arrArgs));
  }

  /**
   * Returns a unique list of depot file paths for shelved files in the changelist.
   * Internally runs `p4 describe -s -S` and parses the result.
   */
  async getShelvedFilesFromChangelist(changelistNumber) {
    if (!await this._ensureAvailable()) {
      return [];
    }

    const strOut = await this.getDescribeSummaryOutput(changelistNumber, true);
    const arrFiles = [];
    const setSeen = new Set();
    const re = /^\.\.\.\s+(\/\/\S+?)#(\d+)\s+(\w+)/;

    for (const strLine of String(strOut || '').split(/\r?\n/)) {
      const matches = strLine.match(re);
      if (matches) {
        const strFile = this.sanitizeDepotPath(matches[1]);
        if (!setSeen.has(strFile)) {
          setSeen.add(strFile);
          arrFiles.push(strFile);
        }
      }
    }

    return arrFiles;
  }

  /**
   * @description Returns a map of changelist number -> unique shelved file list using a single `p4 describe -s -S` call for all provided changelists.
   * @param {number[]} changelistNumbers Array of changelist numbers.
   * @returns {Promise<Map<number, string[]>>}
   */
  async getShelvedFilesFromChangelists(changelistNumbers) {
    const result = new Map();
    if (!Array.isArray(changelistNumbers) || changelistNumbers.length === 0) {
      return result;
    }

    if (!await this._ensureAvailable()) {
      return result;
    }

    const arrArgs = ['describe', '-s', '-S', ...changelistNumbers.map((n) => String(n))];
    const out = await this.run('p4', this._buildArgs(arrArgs));
    const reHeader = /^Change\s+(\d+)\b/;
    const reFile = /^\.\.\.\s+(\/\/\S+?)#(\d+)\s+\w+/;
    let currentCl = undefined;
    let currentSet = undefined;

    for (const line of String(out || '').split(/\r?\n/)) {
      const mHead = line.match(reHeader);
      if (mHead) {
        currentCl = Number(mHead[1]);
        currentSet = new Set();
        result.set(currentCl, []);
        continue;
      }

      if (!currentCl) {
        continue;
      }

      const mFile = line.match(reFile);
      if (mFile) {
        const depotPath = this.sanitizeDepotPath(mFile[1]);
        if (!currentSet.has(depotPath)) {
          currentSet.add(depotPath);
          const arr = result.get(currentCl);
          arr.push(depotPath);
        }
      }
    }

    return result;
  }

  /** Returns unified diff between two revisions via `p4 diff2 -du`. */
  async getUnifiedDiffBetweenRevs(strDepotFile, nFromRev, nToRev) {
    const lhs = `${strDepotFile}#${nFromRev}`;
    const rhs = `${strDepotFile}#${nToRev}`;
    const out = await this.run('p4', this._buildArgs(['diff2', '-du', lhs, rhs]));
    return out;
  }

  /**
   * Returns file contents for a specific depot revision via `p4 print -q`.
   * Useful for constructing a proper side-by-side diff in the editor.
   */
  async getFileContentAtRevision(strDepotFile, nRev) {
    const target = `${strDepotFile}#${nRev}`;
    const out = await this.run('p4', this._buildArgs(['print', '-q', target]));
    return out;
  }

  /**
   * @description Normalizes or sanitizes depot paths. Currently passthrough for potential future logic.
   * @param {string} strPath Raw depot path.
   * @returns {string} Sanitized depot path.
   */
  sanitizeDepotPath(strPath) {
    return strPath;
  }

  /** Returns a list of shelved changelist numbers for the given user. */
  async getPendingChangelistsForUser(strUser) {
    if (!await this._ensureAvailable()) {
      return [];
    }

    const out = await this.run('p4', this._buildArgs(['changes', '-u', String(strUser)]));
    const arr = [];

    for (const line of String(out || '').split(/\r?\n/)) {
      const matches = line.match(/^Change\s+(\d+)\b/);
      if (matches) {
        arr.push(Number(matches[1]));
      }
    }

    return arr;
  }

  /**
   * @description Returns fully populated ChangeListInfo objects for a user using a single `p4 changes -l -u <user>` call.
   * Parses changelist number, date, submit state (*pending*), and multi-line description.
   * @param {string} strUser Perforce user.
   * @param {string} [swarmUrl] Optional Swarm URL to fetch review status.
   * @param {Function} [onUpdate] Optional callback to notify when background fetching updates a changelist.
   * @returns {Promise<ChangeListInfo[]>}
   */
  async getChangeListInfoForUser(strUser, swarmUrl, onUpdate) {
    if (!await this._ensureAvailable()) {
      return [];
    }

    const out = await this.run('p4', this._buildArgs(['changes', '-l', '-u', String(strUser)]));
    const result = [];
    let current = undefined;
    const headerRegex = /^Change\s+(\d+)\s+on\s+(\d{4}\/\d{2}\/\d{2})\s+by\s+(\S+)(?:\s+\*pending\*)?/;

    for (const rawLine of String(out || '').split(/\r?\n/)) {
      const line = rawLine;
      const headerMatch = line.match(headerRegex);

      if (headerMatch) {
        if (current) {
          result.push(current);
        }

        const number = Number(headerMatch[1]);
        const date = headerMatch[2];
        const pending = line.includes('*pending*') ? SubmitStates.PENDING : SubmitStates.SUBMITTED;
        current = new ChangeListInfo(number, '', undefined, pending, date);
        continue;
      }

      if (!current || line.trim().length === 0) {
        continue;
      }

      if (/^[\t ]+/.test(line)) {
        current.description += line.replace(/^\s+/, '');
      }
    }

    if (current) {
      result.push(current);
    }

    if (swarmUrl && result.length > 0) {
      const initialFetchCount = 10;
      const initialBatch = result.slice(0, initialFetchCount);

      await Promise.all(initialBatch.map((cl) => this._populateSwarmInfo(cl, swarmUrl)));
      if (onUpdate) {
        onUpdate();
      }

      if (result.length > initialFetchCount) {
        this._fetchRemainingReviews(result.slice(initialFetchCount), swarmUrl, onUpdate);
      }
    }

    return result;
  }

  /**
   * @description Fetches Swarm info for a list of changelists in background batches.
   * @param {ChangeListInfo[]} infoList List of changelists to fetch.
   * @param {string} swarmUrl The Swarm URL.
   * @param {Function} [onUpdate] Optional callback to notify when a batch is done.
   * @returns {Promise<void>}
   */
  async _fetchRemainingReviews(infoList, swarmUrl, onUpdate) {
    const batchSize = 10;
    for (let i = 0; i < infoList.length; i += batchSize) {
      const batch = infoList.slice(i, i + batchSize);
      await Promise.all(batch.map((cl) => this._populateSwarmInfo(cl, swarmUrl)));
      if (onUpdate) {
        onUpdate();
      }
    }
  }

  /**
   * @description Populates a ChangeListInfo object with Swarm review data.
   * @param {ChangeListInfo} cl The changelist info object.
   * @param {string} swarmUrl The Swarm URL.
   * @returns {Promise<void>}
   */
  async _populateSwarmInfo(cl, swarmUrl) {
    const review = await this.fetchSwarmReview(swarmUrl, cl.changelistNumber);
    if (review) {
      cl.swarmReviewId = review.id;
      if (review.state) {
        cl.codeReviewState = review.state;
      }
    }

    cl.loading = false;
  }

  /**
   * @description Returns a map of changelist -> submitted file list using a single `p4 describe -s` call.
   * @param {number[]} changelistNumbers Changelist numbers.
   * @returns {Promise<Map<number, string[]>>}
   */
  async getSubmittedFilesFromChangelists(changelistNumbers) {
    const result = new Map();
    if (!Array.isArray(changelistNumbers) || changelistNumbers.length === 0) {
      return result;
    }

    if (!await this._ensureAvailable()) {
      return result;
    }

    const arrArgs = ['describe', '-s', ...changelistNumbers.map((n) => String(n))];
    const out = await this.run('p4', this._buildArgs(arrArgs));
    const reHeader = /^Change\s+(\d+)\b/;
    const reFile = /^\.\.\.\s+(\/\/\S+?)#(\d+)\s+\w+/;
    let currentCl = undefined;
    let currentSet = undefined;

    for (const line of String(out || '').split(/\r?\n/)) {
      const mHead = line.match(reHeader);
      if (mHead) {
        currentCl = Number(mHead[1]);
        currentSet = new Set();
        result.set(currentCl, []);
        continue;
      }

      if (!currentCl) {
        continue;
      }

      const mFile = line.match(reFile);
      if (mFile) {
        const depotPath = this.sanitizeDepotPath(mFile[1]);
        if (!currentSet.has(depotPath)) {
          currentSet.add(depotPath);
          const arr = result.get(currentCl);
          arr.push(depotPath);
        }
      }
    }

    return result;
  }

  /**
   * @description Attempts to resolve the Swarm URL via `p4 property`.
   * @returns {Promise<string|undefined>}
   */
  async getSwarmUrlFromProperty() {
    if (!await this._ensureAvailable()) {
      return undefined;
    }

    try {
      // p4 property -l -n swarm.url -F %value%
      const out = await this.run('p4', this._buildArgs(['property', '-l', '-n', 'swarm.url', '-F', '%value%']));
      const url = String(out || '').trim();
      return url.length > 0 ? url.replace(/\/$/, '') : undefined;
    } catch (e) {
      return undefined;
    }
  }

  /**
   * @description Fetches the review status for a changelist from Swarm.
   * @param {string} swarmUrl The base URL for Swarm.
   * @param {number} changeNum The changelist number.
   * @returns {Promise<{id: number, state: string}|undefined>}
   */
  async fetchSwarmReview(swarmUrl, changeNum) {
    if (!swarmUrl || !changeNum) {
      return undefined;
    }

    try {
      // API: /api/v9/reviews?change=123
      const url = `${swarmUrl}/api/v9/reviews?change=${changeNum}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': 'review_preference_set=true; review_ui=preview; SWARM=oikf5hdsggf70ltn72caf1ovqs'
        }
      });

      const data = await response.json();
      if (!response.ok) {
        vscode.window.showErrorMessage(`Perforce error loading swarm info for CL ${changeNum}: ${response.statusText || String(response.status)}`);
        return undefined;
      }

      // Expecting { lastSeen: ..., reviews: [ ... ], totalCount }
      if (data && Array.isArray(data.reviews) && data.reviews.length > 0) {
        const review = data.reviews[0]; // Take the first one found
        return {
          id: review.id,
          state: review.state // e.g. 'needsReview', 'approved', etc.
        };
      }
    }
    catch (error) {
      vscode.window.showErrorMessage(`Swarm fetch error for CL ${changeNum}: ${error.message || String(error)}`);
      console.error(`Swarm fetch error for CL ${changeNum}:`, error);
    }

    return undefined;
  }
}
