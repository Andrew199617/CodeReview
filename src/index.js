#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { AIReviewer } from './CodeReview/AIReviewer.js';
import { CodeReviewRunner } from './CodeReview/CodeReviewRunner.js';
import { PerforceService } from './services/PerforceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() 
{
  const program = new Command();
  program
    .requiredOption('--cl <number>', 'Perforce changelist number')
    .requiredOption('--instructions <file>', 'Path to a text file with review instructions')
    .option('--out <dir>', 'Output directory for the review results', path.join(__dirname, '..', 'reviews'))
    .option('--model <name>', 'OpenAI model to use, default from env OPENAI_MODEL or gpt-5.0-mini-2025')
    .option('--summary', 'Also create a high-level summary across files', true)
    .option('--shelved', 'Review a shelved changelist (adds -S to p4 describe)', false)
    .option('--dry-run', 'Only list files and show small diff previews; do not call GPT', false)
    .option('--concurrency <n>', 'Number of files to process in parallel', (v) => parseInt(v, 10), 3);

  program.parse(process.argv);
  const opts = program.opts();

  const nCl = parseInt(opts.cl);
  if (!Number.isFinite(nCl)) {
    console.error('Invalid --cl');
    process.exit(1);
  }

  if (!opts.dryRun && !process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY. Set it in environment or .env file.');
    process.exit(3);
  }

  const strModel = opts.model || process.env.OPENAI_MODEL || 'gpt-5.0-mini-2025';
  const perforce = new PerforceService();
  const reviewer = new AIReviewer(process.env.OPENAI_API_KEY, process.env.OPENAI_BASE_URL || undefined, strModel);
  const runner = new CodeReviewRunner(perforce, reviewer);

  // Dry-run shortcut: reuse runner’s extract and perforce calls
  if (opts.dryRun) 
  {
    const strDescribe = await perforce.getDescribeOutput(nCl, !!opts.shelved);
    const arrFiles = runner.parseDepotFilesFromDescribe(strDescribe);
    console.log(`Changelist ${nCl} files:`);
    for (const strDepotFile of arrFiles) 
    {
      const strDiff = runner.extractUnifiedDiffForFile(strDescribe, strDepotFile);
      const strPreview = strDiff.split(/\r?\n/).slice(0, 40).join('\n');
      console.log(`- ${strDepotFile}`);
      console.log(strPreview);
      console.log('---');
    }
    
    console.log('Dry run complete.');
    return;
  }

  const strOutDir = path.join(path.resolve(opts.out), `CL_${nCl}`);
  const res = await runner.run({
    cl: nCl,
    instructionsFile: opts.instructions,
    outDir: strOutDir,
    shelved: !!opts.shelved,
    summary: !!opts.summary,
    concurrency: opts.concurrency,
  });
  console.log(`Done. Output: ${strOutDir}. Files reviewed: ${res.nFiles}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
