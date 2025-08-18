import fs from 'fs';
import path from 'path';

export function ensureDir(strDir) 
{
  fs.mkdirSync(strDir, { recursive: true });
}

export function sanitizeFileName(strName) 
{
  return strName.replace(/[\\/:*?"<>|]/g, '_');
}

export function readText(strFile) 
{
  return fs.readFileSync(path.resolve(strFile), 'utf8');
}

export function writeText(strFile, strContent) 
{
  fs.writeFileSync(strFile, strContent);
}
