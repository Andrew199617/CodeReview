import path from 'path';
import { ensureDir, readText, sanitizeFileName, writeText } from '../services/FsUtils.js';

export class CodeReviewRunner {
  constructor(perforce, reviewer) {
    this.perforce = perforce;
    this.reviewer = reviewer;
  }

  // --- Describe and file discovery ---
  async getDescribe(cl, shelved = false) {
    return await this.perforce.getDescribeOutput(cl, shelved);
  }

  /**
   * Parse the depot file paths from a `p4 describe -du [-S]` output by scanning
   * the per-file headers ("==== //depot/path/file#rev ... ====").
   */
  parseDepotFilesFromDescribe(strDescribe) {
    const arrLines = strDescribe.split(/\r?\n/);
    const reHeader = /^====\s+(.+?)\s+====$/;
    const arrFiles = [];

    for (const line of arrLines) {
      const m = line.match(reHeader);
      if (!m) continue;
      const headerBody = m[1];
      // Try to extract the depot path that starts with // and continues until a space or #
      const mDepot = headerBody.match(/(\/\/[\S]+?)(?:#[^\s]+)?(?:\s|$)/);
      if (mDepot) {
        arrFiles.push(mDepot[1]);
      }
    }

    // De-duplicate while preserving order
    const seen = new Set();
    return arrFiles.filter(f => (seen.has(f) ? false : (seen.add(f), true)));
  }

  listFilesFromDescribe(strDescribe) {
    return this.parseDepotFilesFromDescribe(strDescribe);
  }

  extractUnifiedDiffForFile(strDescribe, strDepotFile) {
    const arrLines = strDescribe.split(/\r?\n/);
    const reHeader = /^==== .+ ====$/;
    const reThisFile = new RegExp(`^==== .*${strDepotFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*====$`);

    let nStart = -1;
    for (let i = 0; i < arrLines.length; i++) {
      if (reThisFile.test(arrLines[i])) {
        nStart = i + 1;
        break;
      }
    }

    if (nStart < 0) {
      return '';
    }

    let nEnd = arrLines.length;
    for (let i = nStart; i < arrLines.length; i++) {
      if (reHeader.test(arrLines[i])) {
        nEnd = i;
        break;
      }
    }

    const strBody = arrLines.slice(nStart, nEnd).join('\n');
    if (/^Binary files .+ and .+ differ$/m.test(strBody) || /\(binary\)/i.test(strBody)) {
      return '';
    }

    return strBody;
  }

  getDiffsForFiles(strDescribe, arrFiles) {
    const arr = [];
    for (const strDepotFile of arrFiles) {
      const strDiff = this.extractUnifiedDiffForFile(strDescribe, strDepotFile);
      if (strDiff && strDiff.trim()) {
        arr.push({ strDepotFile, strDiff });
      }
    }
    return arr;
  }

  /**
   * Parse depot files and their revisions from `p4 describe -s` output.
   * Returns [{ file: '//depot/path', rev: 103, action: 'edit' }, ...]
   */
  parseFilesAndRevsFromDescribeSummary(strDescribeS) {
    const arr = [];
    const lines = strDescribeS.split(/\r?\n/);
    // Lines look like: "... //path/file#103 edit"
    const re = /^\.\.\.\s+(\/\/\S+?)#(\d+)\s+(\w+)/;
    for (const line of lines) {
      const m = line.match(re);
      if (m) {
        arr.push({ file: m[1], rev: parseInt(m[2], 10), action: m[3] });
      }
    }
    return arr;
  }

  /**
   * Build diffs via p4 diff2 for each file using rev-1 vs rev.
   */
  async buildDiffsViaDiff2FromSummary(cl, shelved = false) {
    const summary = await this.perforce.getDescribeSummaryOutput(cl, shelved);
    const entries = this.parseFilesAndRevsFromDescribeSummary(summary);
    const diffs = [];
    for (const e of entries) {
      // For add actions, there may be no previous rev; skip if rev <= 1
      const fromRev = Math.max(1, (e.rev || 1) - 1);
      if (e.action === 'add' && e.rev <= 1) {
        // Compare against empty by diff2 may be odd; skip and let reviewer handle lack of context.
        continue;
      }
      if (e.rev <= 0) continue;
      try {
        const full = await this.perforce.getUnifiedDiffBetweenRevs(e.file, fromRev, e.rev);
        // Extract just the unified hunks under the header for this pair
        const body = this.extractUnifiedBodyFromDiff2Output(full);
        if (body.trim()) {
          diffs.push({ strDepotFile: e.file, strDiff: body });
        }
      } catch (err) {
        // ignore individual failures, continue others
      }
    }
    return diffs;
  }

  /** Extract only the unified diff hunks from a diff2 output that begins with a header line. */
  extractUnifiedBodyFromDiff2Output(str) {
    const lines = str.split(/\r?\n/);
    // diff2 header line starts with ==== and may have trailing 'content'
    let start = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^====\s+/.test(lines[i])) {
        start = i + 1;
        break;
      }
    }
    return lines.slice(start).join('\n');
  }

  // --- Reviewing ---
  async reviewSingleDiff(strInstructions, { strDepotFile, strDiff }) {
    const strContent = await this.reviewer.reviewDiffForFile(strInstructions, strDepotFile, strDiff);
    return { strDepotFile, strContent };
  }

  async reviewDiffsConcurrently(strInstructions, arrFileDiffs, concurrency = 3) {
    const handler = (idx) => this.reviewSingleDiff(strInstructions, arrFileDiffs[idx]);
    return await this.runConcurrent(arrFileDiffs.length, handler, concurrency);
  }

  // --- Output ---
  writePerFileResult(outDir, { strDepotFile, strContent }) {
    const strFileName = sanitizeFileName(strDepotFile) + '.md';
    writeText(path.join(outDir, strFileName), `# Review: ${strDepotFile}\n\n${strContent}\n`);
  }

  async writeSummaryFile(outDir, arrResults, cl) {
    if (!arrResults.length) return;
    const strSummary = await this.reviewer.summarizeAcrossFiles(arrResults, cl);
    writeText(path.join(outDir, 'summary.md'), strSummary);
  }

  // --- Concurrency helper ---
  async runConcurrent(nItems, handler, concurrency = 3) {
    const nMax = Math.max(1, Math.min(10, concurrency || 3));
    let nNext = 0;
    const results = [];
    const errors = [];

    async function worker() {
      while (true) {
        const idx = nNext++;
        if (idx >= nItems) break;
        try {
          const res = await handler(idx);
          if (res !== undefined) results.push(res);
        }
        catch (err) {
          errors.push({ idx, err });
        }
      }
    }

    await Promise.all(Array.from({ length: nMax }, () => worker()));
    if (errors.length) {
      // Surface the first error while still allowing partial results to be used by callers if desired.
      // Callers can catch and inspect partials via the error object if we choose to include them later.
      // For now, just throw the initial error.
      throw errors[0].err;
    }
    return results;
  }

  /**
   * Run reviews for a changelist using options:
   * { cl, instructionsFile, outDir, shelved, summary, concurrency }
   */
  async run(opts) {
    const { cl, instructionsFile, outDir, shelved = false, summary = true, concurrency = 3 } = opts || {};

    const strDescribe = await this.getDescribe(cl, shelved);
    const arrFiles = this.listFilesFromDescribe(strDescribe);
    if (arrFiles.length === 0) {
      // Fall back to -s summary + diff2 later in the flow
    }

    ensureDir(outDir);
    const strInstructions = readText(instructionsFile);

    // Build the worklist of diffs
    let arrFileDiffs = this.getDiffsForFiles(strDescribe, arrFiles);
    if (arrFileDiffs.length === 0) {
      // Fallback path: use describe -s and diff2 to build diffs
      arrFileDiffs = await this.buildDiffsViaDiff2FromSummary(cl, shelved);
    }

    console.log(`[CodeReview] CL ${cl}: ${arrFileDiffs.length} file(s) with diffs to review.`);
    if (arrFileDiffs.length === 0) {
      return { arrFilesReviewed: [], nFiles: 0 };
    }

    let newArrayDiffs = [""];
    for (let i = 0; i < arrFileDiffs.length; i++) {
      newArrayDiffs[0] += arrFileDiffs[i].strDiff;
      newArrayDiffs[0] += arrFileDiffs[i].strDiff;
    }

    // Review concurrently
    console.log(`[CodeReview] Starting reviews with concurrency=${concurrency} ...`);
    const arrResults = await this.reviewDiffsConcurrently(strInstructions, newArrayDiffs, concurrency);
    console.log(`[CodeReview] Completed reviews. Writing outputs...`);

    // Write outputs
    for (const res of arrResults) {
      this.writePerFileResult(outDir, res);
    }
    if (summary) {
      await this.writeSummaryFile(outDir, arrResults, cl);
    }

    return { arrFilesReviewed: arrResults.map(r => r.strDepotFile), nFiles: arrResults.length };
  }
}
