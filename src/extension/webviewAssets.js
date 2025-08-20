import path from 'path';
import * as vscode from 'vscode';

export function getWebviewAssetUri(context, webview, relPath) {
  const abs = vscode.Uri.file(path.join(context.extensionPath, relPath));
  return webview.asWebviewUri(abs);
}
