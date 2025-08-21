---
applyTo: '**'
---

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
Bad:
```
if(bool) nNum = 1;
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

Do not create variables that are shorter than 3 characters. Exception is `i` for loop counters and `x` + `y` for coordinates. Prefer meaningful names.
this._files.map((f) => f.path) // bad
this._files.map((file) => file.path) // good
