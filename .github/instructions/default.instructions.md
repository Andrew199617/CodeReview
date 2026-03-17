---
applyTo: '**'
---

# Project Overview

This project is a Visual Studio Code extension that provides a tree view of shelved files in Perforce for specified users. It allows users to easily view and diff shelved files directly within VS Code. The idea is to make it easier for developers to review other people's code by providing a better Code Review Experience than what Perforce's Swarm provides.

# General Instructions

Pretend you are a senior developer making code that will be as maintainable as possible. When adding code to a class check to see if you can improve how you add new code. Seeing if you should add new methods or classes instead of inlining everything.

## Coding Style

- When breaking out functions try not to create functions with more than 3 parameters. The method is doing too much or is being broken up too much.
- Always add "this." before a property or a member or a method.
- When creating the variable for a for loop prefer i over nIndex/nIdx etc.

- Always add jsdoc to functions in javascript. The most important information to include is the function's purpose, parameters, and return value. It's a way of getting type safety if its in the params. Always use @description and don't add return/enters between jsdoc tags.

Use @returns.
Bad:
```
/** Returns a list of shelved changelist numbers for the given user. */
```
Good:
```
/** @returns {number[]} Returns a list of shelved changelist numbers for the given user. */
```

Don't describe an empty function or constructor.
Bad:
```
/**
  * ConfigService provides access to perforce review configuration.
  */
constructor() {
}
```
Good:
```
constructor() { }
```

Always add braces to an if statement.
Good:
```
if(bool) {
  nNum = 1;
}
```
Bad:
```
if(bool)
  nNum = 1;
```
Mix depends on if depended on if there are many single ifs in a row:
```
if(bool) nNum = 1;
if(bool2) nNum = 2;
```

Always add a new line after the end of a code block. Always put braces on new lines.
Bad:
```
for (let i = nStart; i < arrLines.length; i++) {
  if (reHeader.test(arrLines[i])) { nEnd = i; break; }
}
const strBody = arrLines.slice(nStart, nEnd).join('\n');
```

Good:
```
for (let i = nStart; i < arrLines.length; i++) {
  if (reHeader.test(arrLines[i])) {
    nEnd = i; break;
  }
}

const strBody = arrLines.slice(nStart, nEnd).join('\n');
```

Do not add comments on why you did something to the code.
Bad:
```
let maxNumFiles = 5; // Max number of files you can add.
```
Good:
```
let maxNumFiles = 5;
```

Do not write code like this. m_isInPanel1 is already false. Use the boolean directly.
Bad:
```
if (!m_isInPanel1) {
    m_isInPanel1 = false;
}
or
bool bPointRight = this.IsCollapsed ? true : false;
```

Do not write functions that just return the paramater. Code needs to actually serve a purpose.
Bad:
```
getTreeItem(element)
{
  return element;
}
```

Don't use magic numbers:
Bad 5 is not a variable.:
```
if(numCars < 5) {
  return true;
}
```
Good adds maxNumCars somewhere locally or in class as member or property:
```
if(numCars < maxNumCars) {
  return true;
}
```
Good creates local variable right above. Only do if the variable is not used multiple times.:
```
const maxParkingSpaces = 5;
if(numCars < maxParkingSpaces) {
  return true;
}
```

Always put new statements on a new line.
Bad because else is on same line as }.:
```
if (apiKey) {
  return true;
} else if (value) {
  return false;
} else {
  return false;
}
```
Good because elses are on their own line.:
```
if (apiKey) {
  return true;
}
else if (value) {
  return false;
}
else {
  return false;
}
```

Break out functions when you get a chance.
Bad:
```
async ensureOpenAIConfig() {
  let apiKey = this.getOpenAIKey();
  if (!apiKey) {
    apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your OpenAI API Key',
      ignoreFocusOut: true,
      password: true
    });

    if (!apiKey) {
      return false;
    }
  }

  let model = this.getOpenAIModel();
  if (!model) {
    model = await vscode.window.showInputBox({
      prompt: 'Enter the OpenAI Model to use (e.g., gpt-4)',
      ignoreFocusOut: true
    });

    if (!model) {
      return false;
    }
  }

  return true;
}
```
Good we broke out the repeated code:
```
async ensureOpenAIConfig() {
  const apiKey = await this.promptForSettings('Enter your OpenAI API Key', this.getOpenAIKey());
  if (!apiKey) return false;

  const model = await this.promptForSettings('Enter the OpenAI Model to use (e.g., gpt-4)', this.getOpenAIModel());
  if (!model) return false;

  return true;
}

/**
* @description Prompts the user for a setting value.
* @param {string} prompt - The prompt message to display.
* @param {string} [setting] - The current value of the setting (optional).
* @returns {Promise<string | undefined>} The user's input or undefined if canceled.
*/
promptForSettings(prompt, setting) {
  if (!setting) {
    setting = await vscode.window.showInputBox({
      prompt,
      ignoreFocusOut: true
    });
  }

  return !!setting;
}

Group local variables into logical chunks.
Bad because too many variables in a row without line break.:
```
let leftContent = '';
if (fromRevision > 0) {
  leftContent = await perforceService.getFileContentAtRevision(strFile, fromRevision);
}

const rightContent = await perforceService.getFileContentAtRevision(strFile, revision);
const leftText = normalizeEols(leftContent);
const rightText = normalizeEols(rightContent);
const leftUri = vscode.Uri.parse(`untitled:${strFile}@${fromRevision || 'base'}`);
const rightUri = vscode.Uri.parse(`untitled:${strFile}@${revision}`);
const edit = new vscode.WorkspaceEdit();
edit.insert(leftUri, new vscode.Position(0, 0), leftText);
edit.insert(rightUri, new vscode.Position(0, 0), rightText);
await vscode.workspace.applyEdit(edit);
await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${strFile} — ${fromRevision || 'base'} ↔ ${revision}`);
```
Good because it groups related variables together, making the code more readable and maintainable:
```
const rightContent = await perforceService.getFileContentAtRevision(strFile, revision);
let leftContent = '';
if (fromRevision > 0) {
  leftContent = await perforceService.getFileContentAtRevision(strFile, fromRevision);
}

const leftText = normalizeEols(leftContent);
const rightText = normalizeEols(rightContent);

const leftUri = vscode.Uri.parse(`untitled:${strFile}@${fromRevision || 'base'}`);
const rightUri = vscode.Uri.parse(`untitled:${strFile}@${revision}`);

const edit = new vscode.WorkspaceEdit();
edit.insert(leftUri, new vscode.Position(0, 0), leftText);
edit.insert(rightUri, new vscode.Position(0, 0), rightText);

await vscode.workspace.applyEdit(edit);
await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${strFile} — ${fromRevision || 'base'} ↔ ${revision}`);
```
Bad because it is too much without a line break:
```
export async function activate(context) {
  const configService = new ConfigService();
  const reviewUsers = configService.getReviewUsers();
  const perforceConnection = configService.getPerforceConnection();
  const perforceService = new PerforceService(perforceConnection);
  const shelvedFilesTreeView = new ShelvedFilesTreeDataProvider(reviewUsers, perforceService);
  const treeView = vscode.window.createTreeView('perforce.shelvedFiles', { treeDataProvider: shelvedFilesTreeView, showCollapseAll: false });
  const shelvedFilesTreeController = new ShelvedFilesController(shelvedFilesTreeView, perforceService, configService);
  const cmdFetch = vscode.commands.registerCommand('perforce.shelvedFiles.find', shelvedFilesTreeController.promptAndFetch);
  const cmdDiffSelected = vscode.commands.registerCommand('perforce.shelvedFiles.diffSelected', async (item) => diffSelectedHandler(item, shelvedFilesTreeView, perforceService));
  await configService.ensureOpenAIConfig();

  context.subscriptions.push(treeView, cmdFetch, cmdDiffSelected);
}
```
Good because it groups the correct variables together, making the code more readable and maintainable:
```
export async function activate(context) {
  const configService = new ConfigService();
  const reviewUsers = configService.getReviewUsers();
  const perforceConnection = configService.getPerforceConnection();

  const perforceService = new PerforceService(perforceConnection);
  const shelvedFilesTreeView = new ShelvedFilesTreeDataProvider(reviewUsers, perforceService);
  const treeView = vscode.window.createTreeView('perforce.shelvedFiles', { treeDataProvider: shelvedFilesTreeView, showCollapseAll: false });
  const shelvedFilesTreeController = new ShelvedFilesController(shelvedFilesTreeView, perforceService, configService);

  const cmdFetch = vscode.commands.registerCommand('perforce.shelvedFiles.find', shelvedFilesTreeController.promptAndFetch);
  const cmdDiffSelected = vscode.commands.registerCommand('perforce.shelvedFiles.diffSelected', diffSelectedHandler);

  await configService.ensureOpenAIConfig();

  context.subscriptions.push(treeView, cmdFetch, cmdDiffSelected);
}
```

Avoid christmas tree code. Try to keep functions to max 4 indentations once you pass that amount make sure to invert if statements or breaking out a parts of the function.
Bad:
```
async _ensureChangelistFilesLoaded(changelist, user) {
  const info = this._clInfoMap.get(changelist) || { description: '' };
  if (info.files) {
    return;
  }

  if (user && Array.isArray(this._userClMap.get(user))) {
    const list = this._userClMap.get(user);
    const missing = list.filter((c) => {
      const clInfo = this._clInfoMap.get(c);
      return !clInfo || !Array.isArray(clInfo.files);
    });

    if (missing.length > 0) {
      try {
        const map = await this._perforce.getShelvedFilesFromChangelists(missing);
        for (const c of missing) {
          const clInfo = this._clInfoMap.get(c) || { description: '' };
          if (map.has(c)) {
            clInfo.files = map.get(c);
          }
          this._clInfoMap.set(c, clInfo);
        }
      }
      catch (err) {
        vscode.window.showErrorMessage(`Perforce error loading shelved files (batch) for user ${user}: ${err?.message || String(err)}`);
      }
    }
  }
}
```

Add docs and type jsdoc annotation to all members in classes.
Bad:
```
constructor(reviewUsers, perforceService) {
  this._userClMap = new Map(); // user -> number[] (ordered list of that user's pending CL numbers)

  /**
    * @description Map of changelist number -> info object.
    * { description: string, files?: string[] }
    * Files are populated lazily on expansion of a changelist node to avoid extra p4 calls.
    */
  this._clInfoMap = new Map();
}
```
Good because the type info is baked in instead of described also no inline comment:
```
/**
  * @param {string[]} reviewUsers The users to shelve files for.
  * @param {PerforceService} perforceService The Perforce service instance to use for fetching data.
  */
constructor(reviewUsers, perforceService) {
  /**
    * @description Map of user -> changelist numbers.
    * @type {Map<string, number[]>}
    */
  this._userClMap = new Map();

  /**
    * @description Map of changelist number -> info object.
    * @type {Map<number, { description: string, files?: string[] }>}
    */
  this._clInfoMap = new Map();
}
```

Bad because the function passed as a paramater is really too big. Its better to break out a function/lambda from the paramater. Bad because no space between if statement ending brace and await vscode:
```
registerCommand('perforce.shelvedFiles.refreshChangelist', async (item) => {
  if (!item || typeof item.cl !== 'number') {
    return;
  }
  await vscode.window.withProgress({ location: { viewId: 'perforce.shelvedFiles' }, cancellable: false, title: `Refreshing CL ${item.cl}` }, async () => {
    await shelvedFilesTreeView.reloadChangelist(item.cl, item.user);
  });
});
```
Good because the function is now clearly defined and easier to read. We always put a new line break after every closing brace of a function and if statement. We put the paramaters correctly on their own line since there were more than 3 parameters and a function.
```
async function refreshChangelist(item) {
  if (!item || typeof item.cl !== 'number') {
    return;
  }

  await vscode.window.withProgress(
    {
      location: { viewId: 'perforce.shelvedFiles' },
      cancellable: false,
      title: `Refreshing CL ${item.cl}`
    },
    async () => { await shelvedFilesTreeView.reloadChangelist(item.cl, item.user); }
  );

registerCommand('perforce.shelvedFiles.refreshChangelist', refreshChangelist);
```

Do not create variables that are shorter than 3 characters. Exception is `i` for loop counters and `x` + `y` for coordinates. Prefer meaningful names.
this._files.map((f) => f.path) // bad
this._files.map((file) => file.path) // good
