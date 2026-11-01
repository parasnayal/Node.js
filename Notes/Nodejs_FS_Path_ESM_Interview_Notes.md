# T009 — Node.js File System (`fs`) and Path (`path`) Modules

**Backend + AI Engineering · 24-Week Roadmap · Node.js Foundations**  
**Module style:** ES Modules (ESM) · **Level:** Beginner → Senior Backend Interview

## 1. Mental model

- `node:fs` accesses files and directories through the operating system.
- `node:fs/promises` offers Promise-based APIs that work with `async/await`.
- `node:path` manipulates path strings; it does **not** access the filesystem.
- Most asynchronous filesystem operations use libuv's worker pool rather than blocking the main JavaScript thread while waiting for the I/O.
- File storage is helpful for learning, but a JSON file is not a transactional multi-user database.

## 2. Three API styles

| Style | Import | Example | Main-thread blocking? |
|---|---|---|---|
| Synchronous | `node:fs` | `readFileSync()` | Yes |
| Callback | `node:fs` | `readFile(path, cb)` | No (normal asynchronous usage) |
| Promise | `node:fs/promises` | `await readFile(path)` | No (await suspends its async function) |

### Synchronous

```js
import { readFileSync } from 'node:fs';
const text = readFileSync('./message.txt', 'utf8');
console.log(text);
```

### Callback

```js
import { readFile } from 'node:fs';
readFile('./message.txt', 'utf8', (error, text) => {
  if (error) return console.error(error);
  console.log(text);
});
```

### Promise-based (preferred for this course)

```js
import { readFile } from 'node:fs/promises';
try {
  const text = await readFile('./message.txt', 'utf8');
  console.log(text);
} catch (error) {
  console.error(error);
}
```

**Interview nuance:** `async/await` doesn't turn CPU-intensive JavaScript into background work. Avoid synchronous `fs` methods in busy HTTP request handlers.

## 3. Common filesystem operations

```js
import {
  readFile, writeFile, appendFile, mkdir, readdir,
  stat, rename, copyFile, unlink, rm, access
} from 'node:fs/promises';

await mkdir('./storage', { recursive: true });
await writeFile('./storage/notes.txt', 'First line\n', 'utf8'); // overwrite by default
await appendFile('./storage/notes.txt', 'Second line\n', 'utf8');
console.log(await readFile('./storage/notes.txt', 'utf8'));
console.log(await readdir('./storage'));
const info = await stat('./storage/notes.txt');
console.log({ bytes: info.size, isFile: info.isFile() });
await copyFile('./storage/notes.txt', './storage/backup.txt');
await rename('./storage/backup.txt', './storage/archive.txt');
await unlink('./storage/archive.txt');
```

- `writeFile` overwrites a file by default; it creates it if absent, but **does not automatically create missing parent directories**.
- `appendFile` adds data to the end.
- `unlink` removes a file; `rm` supports broader removal options. Use `rm(..., { recursive: true })` with extreme care.
- `readdir` lists directory entries; `stat` retrieves metadata.
- `access` can check permissions, but **don't check then assume a later operation will succeed**: another process could change the file in between (TOCTOU race). Prefer trying the actual operation and catching errors.

## 4. Buffer vs text

```js
import { readFile } from 'node:fs/promises';
const bytes = await readFile('./photo.jpg');  // Buffer
const text = await readFile('./notes.txt', 'utf8'); // string
```

A `Buffer` contains bytes; `'utf8'` requests decoded text. A UTF-8 character may occupy multiple bytes. Use streams for large files rather than buffering an entire multi-gigabyte file.

## 5. Absolute vs relative paths

- **Absolute:** complete path from filesystem root, e.g. `C:\\Projects\\api\\storage\\task.json` or `/srv/api/storage/task.json`.
- **Relative:** interpreted from a base, e.g. `./storage/task.json`.
- For `fs` methods given a relative string path, the base is usually `process.cwd()` — **not** the source file's directory.

```js
import path from 'node:path';
console.log(process.cwd());
console.log(path.join('storage', 'task.json')); // normalized relative path
console.log(path.resolve('storage', 'task.json')); // absolute from cwd
console.log(path.basename('/srv/api/task.json')); // task.json (POSIX example)
console.log(path.extname('task.json')); // .json
```

| Method | What it does |
|---|---|
| `path.join(a,b)` | Joins and normalizes segments; may remain relative |
| `path.resolve(a,b)` | Resolves to an absolute path; later absolute segments reset earlier ones |
| `path.dirname(x)` | Parent-directory portion |
| `path.basename(x)` | Last path component |
| `path.extname(x)` | Extension |
| `path.isAbsolute(x)` | Tests absolute path |
| `path.normalize(x)` | Normalizes separators and `.` / `..` |

**Security:** `join` and `resolve` do not by themselves prevent path traversal. Don't combine arbitrary user-supplied filenames with a sensitive base directory without proper restriction and validation.

## 6. ESM module-relative file paths

In ESM, CommonJS globals `__dirname` and `__filename` are not provided automatically.

**Recommended portable pattern:**

```js
import { readFile } from 'node:fs/promises';
const TASK_FILE = new URL('./storage/task.json', import.meta.url);
const content = await readFile(TASK_FILE, 'utf8');
```

`new URL(relative, import.meta.url)` resolves relative to the **module file**, independent of the directory from which Node.js was launched. `fs` accepts `file:` URL objects for these operations.

If you need an ordinary filesystem path string:

```js
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
```

Modern Node.js also exposes `import.meta.dirname`/`import.meta.filename` for local-file modules; `fileURLToPath()` is useful when portable explicit conversion is desired.

### Location matters

```text
project/
├── server.js
├── storage/
│   └── task.json
└── utils/
    └── taskStorage.js
```

From `utils/taskStorage.js`, use `new URL('../storage/task.json', import.meta.url)`, not `./storage/task.json`.

## 7. Build your JSON persistence helper (ESM)

Create `storage/task.json` containing `[]`. For a helper next to `server.js`:

```js
// taskStorage.js
import { readFile, writeFile } from 'node:fs/promises';

const TASK_FILE = new URL('./storage/task.json', import.meta.url);

export async function getTasks() {
  const raw = await readFile(TASK_FILE, 'utf8');
  const tasks = JSON.parse(raw);
  if (!Array.isArray(tasks)) throw new Error('Expected tasks array');
  return tasks;
}

export async function saveData(tasks) {
  if (!Array.isArray(tasks)) throw new TypeError('Expected tasks array');
  await writeFile(TASK_FILE, JSON.stringify(tasks, null, 2), 'utf8');
}
```

Usage in your native HTTP API:

```js
const tasks = await getTasks();
const task = { id: 1, title: 'Learn fs', completed: false };
await saveData([...tasks, task]);
```

**Important:** You must not use `JSON.parse(await getTasks())`: the helper already returns a JavaScript array.

### Read responses correctly

```js
try {
  const tasks = await getTasks();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ status: 'OK', data: tasks }));
} catch (error) {
  console.error('Task read failed:', error);
  res.writeHead(500, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ error: 'Unable to retrieve tasks' }));
}
```

Set a successful response status **after** `await getTasks()` succeeds. Never expose absolute filesystem paths or stack traces in client error responses.

## 8. Common filesystem errors

| Error code | Common meaning | Typical response/handling |
|---|---|---|
| `ENOENT` | File/directory missing | Initialize expected file or return not-found as appropriate |
| `EACCES` | Permission denied | Fix permissions; generally server-side failure |
| `EEXIST` | Entry already exists | Handle expected create conflict |
| `EISDIR` | Expected a file, found directory | Correct application path |
| `ENOTDIR` | Path component isn't a directory | Correct path |
| `EMFILE` | Too many open file descriptors | Reduce resource usage and inspect limits |

```js
try {
  await readFile('./missing.json', 'utf8');
} catch (error) {
  if (error.code === 'ENOENT') console.log('Missing file');
  else throw error;
}
```

`JSON.parse()` raises a `SyntaxError` for malformed JSON — it is distinct from an `fs` error.

## 9. Concurrency and data safety

This looks correct for a basic single-user exercise:

```js
const current = await getTasks();
current.push(newTask);
await saveData(current);
```

But simultaneous requests can interleave:

1. Request A reads `[task1]`.
2. Request B reads `[task1]`.
3. A writes `[task1, taskA]`.
4. B writes `[task1, taskB]`.
5. **A's update is lost.**

Node.js can have these races even with one main JavaScript thread because `await` yields while I/O is pending.

- Serializing writes with a queue/mutex helps within one process.
- A database with transactions and constraints is preferable for multi-user production systems.
- `writeFile()` is not automatically an atomic whole-application transaction. A successful write doesn't necessarily mean the bytes have been durably synced to physical media under every failure condition.
- Generating IDs with `max(existing IDs) + 1` can reuse IDs after deleting the highest and can collide under concurrent requests. A persistent counter/UUID or DB identity is safer.

## 10. Streams vs `readFile`

```js
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

await pipeline(
  createReadStream('./large.pdf'),
  createWriteStream('./copy.pdf')
);
```

`readFile` collects a full file result in memory. Streams move data in chunks and support backpressure. Study in **T010 — Streams & Buffers**.

## 11. 20 interview questions with concise answers

1. **What is `fs`?** Node's core module for file and directory operations.
2. **What is `node:fs/promises`?** Promise-based filesystem APIs suitable for `async/await`.
3. **`readFileSync` vs `readFile`?** The first blocks the calling JS thread; the second is async.
4. **Does `await readFile` block the event loop?** No; it suspends the async function while I/O progresses.
5. **Does `writeFile` append by default?** No; it overwrites by default.
6. **How do you append?** `appendFile()` or use appropriate write flags.
7. **Does `writeFile` create parent folders?** No; create them separately with `mkdir({ recursive: true })`.
8. **What does `readFile` return without encoding?** A `Buffer`.
9. **What does `'utf8'` do?** Decodes file bytes to a string.
10. **What is an absolute path?** A complete path rooted in the filesystem.
11. **What's the base for `./file.txt` in `readFile`?** `process.cwd()`.
12. **`path.join` vs `path.resolve`?** Join may be relative; resolve returns absolute.
13. **Does `path.join` access disk?** No, it only manipulates paths.
14. **How do you locate module-relative files in ESM?** `new URL('./file', import.meta.url)`.
15. **Why can a file read fail with ENOENT?** The specified path does not exist.
16. **Why shouldn't you check `access()` first and rely on it?** The file state may change between check and use.
17. **Does `await writeFile` guarantee no data loss?** No; concurrency and durability concerns remain.
18. **Why can two async POSTs lose data in a JSON file?** Read-modify-write sequences can interleave.
19. **When is `createReadStream` preferable?** Large files and progressive processing.
20. **Is a JSON file a substitute for a DB?** Not for robust concurrent, transactional, multi-user workloads.

## 12. Practice exercises

**Easy** — Create `notes.txt`, write two lines, append another, read it, and print its size using `stat()`.

**Medium** — Extend your ESM Task API so `GET /tasks`, `GET /tasks/:id`, `POST /tasks`, and `DELETE /tasks/:id` use `getTasks()` and `saveData()` consistently. Return correct 400/404/201/204/500 responses.

**Medium** — Run your app from a different working directory. Compare using `./storage/task.json` versus `new URL('./storage/task.json', import.meta.url)`.

**Advanced** — Simulate two concurrent task creations and investigate a lost update. Explain a single-process write queue and how database transactions later solve this more robustly.

### Completion checklist

- [ ] I can explain `fs` vs `path`.
- [ ] I can use `node:fs/promises` with ESM.
- [ ] I know sync vs async filesystem I/O.
- [ ] I understand Buffer vs text encoding.
- [ ] I can explain absolute vs relative paths and `process.cwd()`.
- [ ] I can resolve module-relative file paths using `import.meta.url`.
- [ ] I can store and reload JSON data across server restarts.
- [ ] I handle missing files, invalid JSON, and write failures.
- [ ] I know why concurrent JSON-file updates can lose data.
- [ ] I can answer the interview questions without memorizing scripts.

## Official references

- [Node.js File System API](https://nodejs.org/api/fs.html)
- [Node.js Path API](https://nodejs.org/api/path.html)
- [Node.js ESM documentation](https://nodejs.org/api/esm.html)
- [Node.js Buffers](https://nodejs.org/api/buffer.html)
- [Node.js Streams](https://nodejs.org/api/stream.html)

**Next:** T010 — Streams and Buffers Basics.
