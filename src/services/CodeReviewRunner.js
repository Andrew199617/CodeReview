import path from 'path';
import { ensureDir, readText, writeText, sanitizeFileName } from './FsUtils.js';

export class CodeReviewRunner 
{
  constructor(perforce, reviewer) 
  {
    this.perforce = perforce;
    this.reviewer = reviewer;
  }

  extractUnifiedDiffForFile(strDescribe, strDepotFile) 
  {
    const arrLines = strDescribe.split(/\r?\n/);
    const reHeader = /^==== .+ ====$/;
    const reThisFile = new RegExp(`^==== .*${strDepotFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*====$`);

    let nStart = -1;
    for (let i = 0; i < arrLines.length; i++) 
    {
      if (reThisFile.test(arrLines[i])) 
      { 
        nStart = i + 1; 
        break; 
      }
    }
    if (nStart < 0) 
    { 
      return ''; 
    }

    let nEnd = arrLines.length;
    for (let i = nStart; i < arrLines.length; i++) 
    {
      if (reHeader.test(arrLines[i])) 
      { 
        nEnd = i; 
        break; 
      }
    }

    const strBody = arrLines.slice(nStart, nEnd).join('\n');
    if (/^Binary files .+ and .+ differ$/m.test(strBody) || /\(binary\)/i.test(strBody)) 
    { 
      return ''; 
    }
    return strBody;
  }

  async run(nCl, strInstructionsFile, strOutDir, bShelved, bSummary, nConcurrency) 
  {
    await this.perforce.ensureAvailable();

    const arrFiles = await this.perforce.getChangelistFiles(nCl);
    if (arrFiles.length === 0) 
    {
      throw new Error('No files in changelist or unable to parse p4 describe.');
    }

    const strDescribe = await this.perforce.getDescribeOutput(nCl, bShelved);

    ensureDir(strOutDir);
    const strInstructions = readText(strInstructionsFile);

    const arrResults = [];

    const nMax = Math.max(1, Math.min(10, nConcurrency || 3));
    let nNext = 0;
    const self = this;

    async function worker() 
    {
      while (nNext < arrFiles.length) 
      {
        const nIdx = nNext++;
        const strDepotFile = arrFiles[nIdx];
        const strDiff = self.extractUnifiedDiffForFile(strDescribe, strDepotFile);
        if (!strDiff.trim()) 
        {
          continue;
        }

        const strContent = await self.reviewer.reviewDiffForFile(strInstructions, strDepotFile, strDiff);
        const strFileName = sanitizeFileName(strDepotFile) + '.md';
        writeText(path.join(strOutDir, strFileName), `# Review: ${strDepotFile}\n\n${strContent}\n`);
        arrResults.push({ strDepotFile, strContent });
      }
    }

    await Promise.all(Array.from({ length: nMax }, () => worker()));

    if (bSummary && arrResults.length) 
    {
      const strSummary = await this.reviewer.summarizeAcrossFiles(arrResults, nCl);
      writeText(path.join(strOutDir, 'summary.md'), strSummary);
    }

    return { arrFilesReviewed: arrResults.map(r => r.strDepotFile), nFiles: arrResults.length };
  }
}
