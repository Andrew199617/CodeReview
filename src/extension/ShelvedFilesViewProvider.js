import { PerforceService } from '../services/PerforceService.js';
import { getShelvedViewHtml } from './webviewHtml.js';

export class ShelvedFilesViewProvider {
  constructor(context) {
    this.context = context;
    this.perforce = new PerforceService();
    this.webviewView = undefined;
  }

  resolveWebviewView(webviewView) {
    this.webviewView = webviewView;
    const webview = webviewView.webview;
    webview.options = { enableScripts: true };
    webview.html = getShelvedViewHtml(webview);

    webview.onDidReceiveMessage(async (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'fetch') {
        await this._handleFetch(msg.cl);
      }
    });
  }

  async _handleFetch(input) {
    const webview = this.webviewView?.webview;
    if (!webview) return;

    const cl = Number(String(input || '').trim());
    if (!Number.isFinite(cl) || cl <= 0) {
      webview.postMessage({ type: 'error', message: 'Please enter a valid changelist number.' });
      return;
    }

    try {
      webview.postMessage({ type: 'status', message: `Querying p4 for CL ${cl} (shelved)...` });
      await this.perforce.ensureAvailable();
      const out = await this.perforce.getDescribeSummaryOutput(cl, true);

      const files = [];
      const seen = new Set();
      const re = /^\.\.\.\s+(\/\/\S+?)#(\d+)\s+(\w+)/;
      for (const line of out.split(/\r?\n/)) {
        const matches = line.match(re);
        if (matches) {
          const match = matches[1];
          if (!seen.has(match)) {
            seen.add(match);
            files.push(match);
          }
        }
      }

      webview.postMessage({ type: 'results', cl, files });
    } catch (err) {
      const message = (err && err.message) ? err.message : String(err);
      webview.postMessage({ type: 'error', message });
    }
  }
}
