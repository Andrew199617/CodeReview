import { execa } from 'execa';

function sanitizeDepotPath(strPath) 
{
  return strPath;
}

export class PerforceService 
{
  constructor() 
  {
  }

  async run(strCmd, arrArgs) 
  {
    const { stdout } = await execa(strCmd, arrArgs);
    return stdout;
  }

  async ensureAvailable() 
  {
    await this.run('p4', ['-V']);
  }

  async getChangelistFiles(nCl) 
  {
    const strOut = await this.run('p4', ['describe', '-s', String(nCl)]);
    const arrLines = strOut.split(/\r?\n/);
    const arrFiles = [];
    let bInFiles = false;
    for (const strLine of arrLines) 
    {
      if (strLine.startsWith('Affected files ...')) 
      { 
        bInFiles = true; 
        continue; 
      }
      if (bInFiles) 
      {
        if (!strLine.trim()) 
        { 
          break; 
        }
        const m = strLine.match(/^\.\.\.\s+([^#\s]+)#\d+\s+\w+/);
        if (m) 
        { 
          arrFiles.push(sanitizeDepotPath(m[1])); 
        }
      }
    }
    return arrFiles;
  }

  async getDescribeOutput(nCl, bShelved) 
  {
    const arrArgs = ['describe', '-du'];
    if (bShelved) 
    { 
      arrArgs.push('-S'); 
    }
    arrArgs.push(String(nCl));
    const strOut = await this.run('p4', arrArgs);
    return strOut;
  }
}
