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

/**
 * @description Normalizes end of line characters to LF only.
 * @param {string} content Raw text content.
 * @returns {string} Normalized content.
 */
export function normalizeEols(content) {
  if (content == null) {
    return '';
  }

  return String(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}