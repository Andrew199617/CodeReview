import { execa } from 'execa';

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

  /** Normalizes/sanitizes depot paths if needed. Currently a passthrough. */
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
}
