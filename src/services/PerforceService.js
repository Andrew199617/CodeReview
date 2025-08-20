import { execa } from 'execa';

/**
 * Thin wrapper around the `p4` CLI used by the tools and the VS Code extension.
 * Provides helpers to check availability, describe changelists, and retrieve diffs.
 */
export class PerforceService {
  constructor() {
  }

  /** Runs a command and returns stdout. Throws on non-zero exit. */
  async run(strCmd, arrArgs) {
    const { stdout } = await execa(strCmd, arrArgs);
    return stdout;
  }

  /** Ensures `p4` is available by executing `p4 -V`. */
  async ensureAvailable() {
    await this.run('p4', ['-V']);
  }

  /** Returns a list of depot files from `p4 describe -s <cl>`. */
  async getChangelistFiles(nCl) {
    const strOut = await this.run('p4', ['describe', '-s', String(nCl)]);
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

      const m = strLine.match(/^\.\.\.\s+([^#\s]+)#\d+\s+\w+/);
      if (m) {
        arrFiles.push(this.sanitizeDepotPath(m[1]));
      }

    }
    return arrFiles;
  }

  /** Returns full `p4 describe -du [-S] <cl>` output for diffs. */
  async getDescribeOutput(nCl, bShelved) {
    const arrArgs = ['describe', '-du'];
    if (bShelved) {
      arrArgs.push('-S');
    }

    arrArgs.push(String(nCl));
    return await this.run('p4', arrArgs);;
  }

  /** Returns summary `p4 describe -s [-S] <cl>` output for parsing files and revs. */
  async getDescribeSummaryOutput(nCl, bShelved = false) {
    const arrArgs = ['describe', '-s'];
    if (bShelved) {
      arrArgs.push('-S');
    }

    arrArgs.push(String(nCl));
    return await this.run('p4', arrArgs);;
  }

  /**
   * Returns a unique list of depot file paths for shelved files in the changelist.
   * Internally runs `p4 describe -s -S` and parses the result.
   */
  async getShelvedFilesFromChangelist(nCl) {
    await this.ensureAvailable();
    const strOut = await this.getDescribeSummaryOutput(nCl, true);
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
    // Use unified diff (-du) for easier prompting
    const lhs = `${strDepotFile}#${nFromRev}`;
    const rhs = `${strDepotFile}#${nToRev}`;
    const out = await this.run('p4', ['diff2', '-du', lhs, rhs]);
    return out;
  }

  /**
   * Returns file contents for a specific depot revision via `p4 print -q`.
   * Useful for constructing a proper side-by-side diff in the editor.
   */
  async getFileContentAtRevision(strDepotFile, nRev) {
    const target = `${strDepotFile}#${nRev}`;
    const out = await this.run('p4', ['print', '-q', target]);
    return out;
  }

  /** Normalizes/sanitizes depot paths if needed. Currently a passthrough. */
  sanitizeDepotPath(strPath) {
    return strPath;
  }
}
