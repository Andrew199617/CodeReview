export function getShelvedViewHtml(webview) {
  const csp = webview.cspSource;
  const nonce = String(Date.now());
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp}; style-src ${csp} 'unsafe-inline'; script-src ${csp} 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Perforce Shelved Files</title>
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); margin: 0; padding: 0.6rem; color: var(--vscode-foreground); }
    .row { display: flex; gap: 0.5rem; align-items: center; }
    input[type="number"] { flex: 1; padding: 0.35rem 0.5rem; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 2px; }
    button { padding: 0.35rem 0.7rem; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; border-radius: 2px; cursor: pointer; }
    button:hover { filter: brightness(1.1); }
    .status { margin: 0.5rem 0; color: var(--vscode-descriptionForeground); }
    ul { list-style: none; padding-left: 0; margin: 0.5rem 0; }
    li { padding: 0.25rem 0; border-bottom: 1px solid var(--vscode-editorWidget-border); word-break: break-all; }
    .error { color: var(--vscode-errorForeground); }
  </style>
  </head>
  <body>
    <div class="row">
      <input id="cl" type="number" placeholder="Enter shelved CL (p4)" />
      <button id="find">Find</button>
    </div>
    <div id="status" class="status"></div>
    <ul id="list"></ul>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const $ = (id) => document.getElementById(id);
      const clInput = $('cl');
      const findBtn = $('find');
      const status = $('status');
      const list = $('list');

      function setStatus(text, isError=false) {
        status.textContent = text || '';
        status.className = 'status' + (isError ? ' error' : '');
      }

      function setFiles(files) {
        list.innerHTML = '';
        for (const f of files) {
          const li = document.createElement('li');
          li.textContent = f;
          list.appendChild(li);
        }
      }

      function doFetch() {
        const cl = clInput.value.trim();
        if (!cl) { setStatus('Please enter a CL.'); return; }
        setStatus('');
        vscode.postMessage({ type: 'fetch', cl });
      }

      findBtn.addEventListener('click', doFetch);
      clInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doFetch(); });

      window.addEventListener('message', (e) => {
        const msg = e.data || {};
        switch (msg.type) {
          case 'status':
            setStatus(msg.message || '');
            break;
          case 'error':
            setStatus(msg.message || 'Error', true);
            break;
          case 'results':
            setStatus(String((msg.files||[]).length) + ' file(s) in CL ' + String(msg.cl) + '.');
            setFiles(msg.files || []);
            break;
        }
      });
    </script>
  </body>
</html>`;
}
