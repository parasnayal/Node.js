# T009 — Node.js `path` Module (ESM) — Study & Interview Notes

> Roadmap: Backend + AI Engineering, Node.js Foundations. All JavaScript examples use **ES Modules** (`"type": "module"` or `.mjs`).

## 1. What is `node:path`?

`node:path` is a built-in Node.js module for **constructing, examining, normalizing, and resolving filesystem path strings**. It does **not** read files, create directories, or verify that a file exists. Use `node:fs` or `node:fs/promises` for actual filesystem operations.

```js
import path from 'node:path';
// Or import only what you need:
import { join, resolve, basename } from 'node:path';
```

**Mental model:** `path` handles *addresses*, `fs` handles *files and directories*.

## 2. Absolute vs relative paths

An **absolute path** identifies a location starting at a filesystem root:

- Windows: `C:\\Projects\\task-api\\storage\\tasks.json`
- Linux/macOS: `/home/dev/task-api/storage/tasks.json`

A **relative path** depends on a starting directory:

- `./storage/tasks.json` — inside the current directory
- `../storage/tasks.json` — one directory up, then into `storage`

When passed a relative string, most Node.js filesystem APIs interpret it relative to **`process.cwd()`**, not the source file's directory.

```js
import process from 'node:process';
console.log(process.cwd()); // Directory from which the process is running
```

## 3. `path.join()` vs `path.resolve()`

### `path.join(...segments)`
Combines segments and normalizes separators and `.`/`..`. The result is **not necessarily absolute**.

```js
import path from 'node:path';

path.join('storage', 'tasks.json'); // 'storage/tasks.json' on POSIX
path.join('src', '..', 'storage', 'tasks.json'); // 'storage/tasks.json' on POSIX
```

### `path.resolve(...segments)`
Processes segments **right to left** until an absolute path is found; if none is found, it uses `process.cwd()` and returns an absolute path.

```js
// Suppose process.cwd() is '/app'
path.resolve('storage', 'tasks.json'); // '/app/storage/tasks.json'
path.resolve('/app', '/tmp', 'x.txt'); // '/tmp/x.txt' (later absolute path wins)
```

| Feature | `join()` | `resolve()` |
| --- | --- | --- |
| Purpose | Combine and normalize segments | Produce an absolute resolved path |
| Uses current working directory | No (unless explicitly supplied) | Yes, if needed |
| Output always absolute | No | Yes |
| Absolute segment behavior | Joins segments rather than resetting like `resolve()` | Rightmost absolute path takes precedence |

**Interview tip:** Neither function validates whether a path is safe or whether a file exists.

## 4. Common utilities

```js
import path from 'node:path';

const p = '/app/storage/tasks.json';
path.basename(p);                 // 'tasks.json'
path.basename(p, '.json');        // 'tasks'
path.dirname(p);                  // '/app/storage'
path.extname(p);                  // '.json'
path.isAbsolute(p);               // true (on POSIX)
path.normalize('/app/a/../b');    // '/app/b' (on POSIX)
path.parse(p);                    // { root, dir, base, ext, name }
path.format(path.parse(p));       // '/app/storage/tasks.json'
path.relative('/app', '/app/storage/tasks.json'); // 'storage/tasks.json'
path.sep;                         // '/' on POSIX, '\\' on Windows
path.delimiter;                   // ':' on POSIX, ';' on Windows
```

`basename()` and `extname()` are **string operations**. They do not check files on disk.

## 5. Cross-platform paths: Windows vs POSIX

Default `node:path` behavior follows the host operating system. If you need predictable interpretation, use:

```js
import path from 'node:path';

path.posix.basename('/app/storage/tasks.json'); // 'tasks.json'
path.win32.basename('C:\\app\\storage\\tasks.json'); // 'tasks.json'
path.win32.join('C:\\app', 'storage', 'tasks.json');
```

**Windows nuance:** Paths such as `C:folder\\file.txt` are drive-relative, not equivalent to `C:\\folder\\file.txt`. UNC paths (`\\\\server\\share\\file.txt`) also have special semantics.

Avoid manually joining filesystem paths with `/` or `\\` when platform portability matters.

## 6. ESM paths: `import.meta.url` and module-relative files

ESM doesn't automatically expose CommonJS `__dirname` or `__filename` bindings.

```js
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
console.log({ filename, dirname });
```

On supported recent Node versions, local ESM modules can also use `import.meta.filename` and `import.meta.dirname`.

### Preferred simple ESM pattern for a neighboring file

```js
import { readFile } from 'node:fs/promises';
const taskFile = new URL('./storage/tasks.json', import.meta.url);
const tasks = JSON.parse(await readFile(taskFile, 'utf8'));
```

`new URL()` gives a **file URL**, not a filesystem path string. Node's file APIs accept file URLs in many places. For APIs that require a path string, use `fileURLToPath()`, not `.pathname` (which can mishandle spaces, escapes, and Windows drives).

### Directory layout matters

```text
task-api/
├─ server.js
├─ storage/
│  └─ tasks.json
└─ utils/
   └─ storage.js
```

Inside `utils/storage.js`:

```js
const taskFile = new URL('../storage/tasks.json', import.meta.url);
```

By contrast, `./storage/tasks.json` passed to `readFile()` uses `process.cwd()`.

## 7. Why path bugs happen

```js
// Running `node /app/server.js` from /tmp means process.cwd() === '/tmp'
await readFile('./storage/tasks.json', 'utf8'); // Attempts /tmp/storage/tasks.json
```

Anchoring with `import.meta.url` avoids dependency on the launch directory for bundled project data files.

Useful rule:
- **Project/module resource:** resolve relative to `import.meta.url`.
- **User-selected file path or CLI working path:** a `process.cwd()`-relative path may be intentional.
- **Configured storage directory:** validate and explicitly resolve the configuration.

## 8. Filesystem security: path traversal

**Unsafe:**

```js
const full = path.join('/app/uploads', userProvidedName);
// An input like '../../secret.txt' can escape the uploads directory.
```

If accepting user-controlled paths, validate allowable names, resolve against a trusted root, and ensure the resolved target stays within that root. Use `path.relative()` to help check traversal:

```js
import path from 'node:path';

const root = path.resolve('./uploads');

function safePath(name) {
  // Example policy: allow filenames only, not nested paths.
  if (!/^[a-zA-Z0-9._-]+$/.test(name) || name === '.' || name === '..') {
    throw new Error('Invalid file name');
  }
  const candidate = path.resolve(root, name);
  const relative = path.relative(root, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Path escapes upload directory');
  }
  return candidate;
}
```

This is an illustrative path check. For adversarial filesystems, symlinks and time-of-check/time-of-use races also matter; use appropriate file opening policies and platform protections. Do not assume `path.resolve()` alone makes input secure.

## 9. Practical Task API integration (ESM)

`storage/task-store.js`:

```js
import { readFile, writeFile } from 'node:fs/promises';

// Adjust relative URL to match actual directory structure.
const TASKS_FILE = new URL('./tasks.json', import.meta.url);

export async function getTasks() {
  const content = await readFile(TASKS_FILE, 'utf8');
  const tasks = JSON.parse(content);
  if (!Array.isArray(tasks)) throw new Error('Expected a JSON array');
  return tasks;
}

export async function saveTasks(tasks) {
  if (!Array.isArray(tasks)) throw new TypeError('Expected an array');
  await writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
}
```

This is suitable for a learning project but **not** safe against concurrent read-modify-write updates; database persistence or synchronization is needed for multiple writers.

## 10. Practice exercises

1. Print `process.cwd()` and the directory of your ESM module. Start the script from two different directories and compare.
2. Predict `path.join('a', '..', 'b', 'file.txt')` and `path.resolve('a', '..', 'b', 'file.txt')`.
3. Print `basename`, `dirname`, and `extname` of a given file path.
4. Implement `getTasks()` using `new URL('../storage/tasks.json', import.meta.url)` from a `utils` folder.
5. On Windows, use `path.win32.parse('C:\\work\\report.pdf')` and inspect its fields.
6. Write a simple path-traversal test against a fictional uploads folder.

## 11. Interview Q&A (with answers)

**Q1. What does `node:path` do?**  
A. It manipulates filesystem path strings; it doesn't perform file I/O.

**Q2. Absolute vs relative path?**  
A. An absolute path starts from a filesystem root. A relative one is interpreted from a base directory.

**Q3. What does `process.cwd()` return?**  
A. The current working directory of the Node.js process.

**Q4. Are relative paths in `fs.readFile()` resolved from the JS file?**  
A. No. String relative paths are generally resolved using `process.cwd()`.

**Q5. What does `path.join()` do?**  
A. Joins and normalizes path segments; result may be relative.

**Q6. What does `path.resolve()` do?**  
A. Produces an absolute path, using later absolute segments or `process.cwd()`.

**Q7. Does `path.join()` check file existence?**  
A. No.

**Q8. What does `path.basename('/a/b.txt')` return?**  
A. `'b.txt'` on POSIX.

**Q9. What does `path.extname('archive.tar.gz')` return?**  
A. `'.gz'`.

**Q10. What does `path.dirname()` return?**  
A. The parent-directory component of a path string.

**Q11. What does `path.normalize()` do?**  
A. Normalizes separators and `.`/`..` segments lexically.

**Q12. What does `path.isAbsolute()` check?**  
A. Whether the path is absolute under the selected platform's semantics.

**Q13. Why prefer `path.win32`/`path.posix` sometimes?**  
A. To parse paths according to a known platform independent of the host OS.

**Q14. How do ESM modules locate their own file?**  
A. Via `import.meta.url`, and often `fileURLToPath(import.meta.url)`.

**Q15. Is `import.meta.url` a path string?**  
A. No. It is a URL string, typically starting with `file:` for local modules.

**Q16. Why not use `new URL(...).pathname` as a local path?**  
A. It may be URL-encoded and may not work correctly with Windows path semantics.

**Q17. What is `path.relative(from, to)`?**  
A. The relative path needed to reach `to` from `from`.

**Q18. What is path traversal?**  
A. User-controlled segments (such as `..`) escaping an intended filesystem directory.

**Q19. Does `path.resolve()` prevent path traversal?**  
A. No; it resolves paths but does not enforce authorization or containment.

**Q20. Can `path` protect against symlink attacks by itself?**  
A. No. Lexical path normalization cannot fully enforce real filesystem access constraints.

## 12. Quick revision checklist

- [ ] I can explain absolute and relative paths.
- [ ] I know when a relative path is based on `process.cwd()`.
- [ ] I can explain `join()` vs `resolve()`.
- [ ] I know `basename()`, `dirname()`, `extname()`, `relative()`, and `normalize()`.
- [ ] I know Windows vs POSIX path differences.
- [ ] I can use `import.meta.url` and `new URL()` with ESM filesystem code.
- [ ] I can explain why `node:path` does not access the filesystem.
- [ ] I understand basic path traversal risks.

## References

- Node.js Path API: https://nodejs.org/api/path.html
- Node.js ESM documentation: https://nodejs.org/api/esm.html
- Node.js File URL conversion: https://nodejs.org/api/url.html#urlfileurltopathurl-options
- Node.js File System API: https://nodejs.org/api/fs.html
