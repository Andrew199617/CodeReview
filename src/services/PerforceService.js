import { execa } from 'execa';

export class PerforceService {
  constructor() {
  }

  async run(strCmd, arrArgs) {
    const { stdout } = await execa(strCmd, arrArgs);
    return stdout;
  }

  async ensureAvailable() {
    await this.run('p4', ['-V']);
  }

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

  async getDescribeOutput(nCl, bShelved) {
    const arrArgs = ['describe', '-du'];
    if (bShelved) {
      arrArgs.push('-S');
    }

    arrArgs.push(String(nCl));
    const strOut = await this.run('p4', arrArgs);
    return strOut;
  }

  async getDescribeSummaryOutput(nCl, bShelved = false) {
    const arrArgs = ['describe', '-s'];
    if (bShelved) {
      arrArgs.push('-S');
    }

    arrArgs.push(String(nCl));
    const strOut = await this.run('p4', arrArgs);
    return strOut;
  }

  async getUnifiedDiffBetweenRevs(strDepotFile, nFromRev, nToRev) {
    // Use unified diff (-du) for easier prompting
    const lhs = `${strDepotFile}#${nFromRev}`;
    const rhs = `${strDepotFile}#${nToRev}`;
    const out = await this.run('p4', ['diff2', '-du', lhs, rhs]);
    return out;
  }

  sanitizeDepotPath(strPath) {
    return strPath;
  }
}
