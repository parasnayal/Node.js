# T011 — Node.js Environment Variables & Process Signals (ESM)

> Backend + AI Engineering | 24-Week Roadmap — Phase 1, Node.js Foundations  
> Level: Beginner → Intermediate → Senior interviews  
> Code style: **ES Modules (ESM)**, native Node.js APIs

## 1. Learning outcomes

After this topic you should be able to:
- Describe an OS process and Node.js `process` object.
- Read, parse and validate environment variables.
- Load `.env` files using modern Node.js without a dependency.
- Distinguish startup configuration from secrets management.
- Explain `SIGINT`, `SIGTERM`, `SIGKILL`, and platform-specific limitations.
- Implement and test graceful HTTP-server shutdown.
- Explain `server.close()`, `process.exit()`, and `process.exitCode` in interviews.

## 2. Process fundamentals

A **process** is a running instance of a program. `node server.js` starts a Node.js process managed by the OS. The process has a PID, memory, file descriptors, networking resources, and an environment.

```js
import process from 'node:process';

console.log('PID:', process.pid);
console.log('Platform:', process.platform); // 'win32', 'linux', 'darwin', ...
console.log('Node version:', process.version);
console.log('Working directory:', process.cwd());
console.log('Executable:', process.execPath);
console.log('Arguments:', process.argv);
```

**Important:** `process.cwd()` is the directory from which the program was launched; it is *not necessarily* the directory containing the current JS module. Use `new URL('./file.json', import.meta.url)` for module-relative file references.

## 3. Environment variables: simple mental model

Environment variables are external, named configuration values inherited or provided when a process starts.

Instead of hardcoding `const PORT = 3000`, use:

```js
import process from 'node:process';
const port = Number(process.env.PORT ?? '3000');
```

Typical values:

| Variable | Example | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Application mode convention |
| `DATABASE_URL` | `postgresql://...` | Database connection configuration |
| `LOG_LEVEL` | `info` | Logging detail |
| `API_KEY` | *(secret)* | Authentication to an external API |

### Strings, missing values, and validation

Values in `process.env` are strings when present, and `undefined` when absent.

```js
// With ENABLE_LOGGING=true
console.log(typeof process.env.ENABLE_LOGGING); // 'string'
const loggingEnabled = process.env.ENABLE_LOGGING === 'true';
```

A reliable port parser:

```js
import process from 'node:process';

function getPort() {
  const raw = process.env.PORT ?? '3000';
  if (!/^\d+$/.test(raw)) throw new Error('PORT must be an integer');
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be in the range 1..65535');
  }
  return port;
}

const PORT = getPort();
```

Validate configuration **at startup**, rather than allowing a malformed configuration to cause obscure errors during HTTP requests.

## 4. Loading a `.env` file with ESM

Suggested project:

```text
task-api/
├── .env
├── .env.example
├── .gitignore
├── package.json
└── server.js
```

`.env` (local configuration):

```dotenv
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
```

`.env.example` (safe to commit, no secrets):

```dotenv
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
DATABASE_URL=replace-me
```

`.gitignore`:

```gitignore
.env
.env.*
!.env.example
```

Run using built-in support in current Node.js releases:

```bash
node --env-file=.env server.js
```

Or, if you use a package script:

```json
{
  "type": "module",
  "scripts": {
    "dev": "node --env-file=.env --watch server.js",
    "start": "node --env-file=.env server.js"
  }
}
```

**Note:** `--env-file` was introduced in Node.js 20.6.0. In hosting environments, injected environment variables may make a local `.env` file unnecessary. If the file is missing, the `--env-file` form errors; `--env-file-if-exists` is available in newer Node.js versions.

### Security practices

- Do not commit real secrets, including accidental historical commits.
- Do not log access tokens or database credentials.
- Never send backend environment secrets to browser JavaScript.
- Treat `.env` as **configuration convenience**, not encryption.
- Prefer managed secret facilities for production deployments.
- Keep permissions to runtime configuration restricted.

## 5. Command-line arguments vs environment variables

```bash
node server.js --verbose
```

```js
import process from 'node:process';
console.log(process.argv); // Node executable, script path, '--verbose'
console.log(process.argv.includes('--verbose'));
```

`process.argv` describes the command invocation; `process.env` holds named environment configuration.

## 6. What are process signals?

A **signal** is a mechanism used by the OS or other processes to notify a process of an event or request an action. They matter when a server is stopped, redeployed, or interrupted.

| Signal | Meaning | Can the process handle it? |
|---|---|---|
| `SIGINT` | Interrupt; often terminal `Ctrl+C` | Yes |
| `SIGTERM` | Request termination | Yes |
| `SIGKILL` | Force termination | No; cannot be caught or ignored |
| `SIGHUP` | Hangup/disconnect (OS-dependent) | Often, platform-dependent |

```js
import process from 'node:process';

process.on('SIGINT', () => {
  console.log('Received SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM');
});
```

**Crucial:** Registering a listener for `SIGINT` or `SIGTERM` changes Node.js's default behavior; your program must now make sure shutdown occurs. Also, Windows has different signal semantics than POSIX/Linux systems. `SIGTERM` support and signal delivery are not perfectly equivalent across platforms.

### Relationship with EventEmitter

`process.on('SIGINT', handler)` uses the familiar EventEmitter interface. The listener runs when Node.js emits the corresponding signal event. Registering `.on()` does not itself trigger an event.

## 7. Graceful shutdown: simple explanation

When a server receives a termination request, it should usually:

1. Start shutdown only once.
2. Stop accepting new connections.
3. Allow active requests a bounded window to finish.
4. Release database pools, queues, and other resources.
5. Let the process exit naturally if possible.
6. Force-stop after a deadline when necessary.

**Why?** Immediate termination can interrupt an API response or leave work unfinished.

### Implement graceful shutdown in a native ESM HTTP server

```js
import http from 'node:http';
import process from 'node:process';

const PORT = Number(process.env.PORT ?? 3000);

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }

  if (req.url === '/slow') {
    setTimeout(() => {
      if (!res.destroyed) res.end('Slow request completed');
    }, 5000);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Listening at http://localhost:${PORT}`);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}: beginning graceful shutdown`);

  // Deadline prevents hanging indefinitely on stuck connections.
  const deadline = setTimeout(() => {
    console.error('Grace period exceeded; forcing HTTP connections closed');
    server.closeAllConnections();
    process.exitCode = 1;
  }, 10_000);
  deadline.unref();

  try {
    await new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    });
    console.log('HTTP server closed');
    // Also close database pools / queue consumers here as applicable.
  } catch (err) {
    console.error('Shutdown failed:', err);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
```

**Important production notes:**
- `server.close()` stops accepting new connections and waits for remaining HTTP connections to close; behavior depends on Node version and connection states.
- `server.closeAllConnections()` force-closes established HTTP(S) connections, but not upgraded connections (e.g., WebSockets). Use as a last resort.
- A deadline must be designed for **all** resource cleanup, not just HTTP. Real deployments often enforce their own termination deadlines.
- `setTimeout()` is not a reliable system-level guarantee if synchronous JavaScript blocks the event loop.
- If a runtime error occurs in an `async` request handler, explicitly catch and respond; native `http` does not provide Express-style error middleware.

### Try it

1. Run `node --env-file=.env server.js`.
2. Visit `http://localhost:3000/slow`.
3. Press `Ctrl+C` in the terminal before the five seconds complete.
4. Observe whether the response finishes and shutdown logging appears.
5. Repeat with no active connections.

On Windows PowerShell, `Ctrl+C` is a convenient way to test `SIGINT`. Linux process managers and orchestrators frequently use `SIGTERM`.

## 8. `process.exit()` vs `process.exitCode`

```js
process.exit(1); // Forces termination; may truncate pending output/work
```

```js
process.exitCode = 1; // Set eventual exit status, do not force immediate exit
```

A graceful shutdown usually prefers closing resources and allowing the event loop to drain. Exit code `0` conventionally denotes success; nonzero denotes failure.

### Does `process.on('exit', callback)` allow async cleanup?

No. The `exit` event runs at the end of the process lifecycle and cannot wait for asynchronous I/O. Initiate async cleanup from termination handlers *before* exit.

```js
process.on('exit', (code) => {
  console.log('Exiting with code:', code); // synchronous only
});
```

## 9. `beforeExit`, uncaught exceptions, and rejected Promises

- `beforeExit`: emitted when Node.js has no additional work scheduled; it may not fire after explicit termination. Scheduling asynchronous work in this hook can keep a process alive.
- `uncaughtException`: signals an exception that escaped normal handling. State may be inconsistent; do minimal synchronous logging and shut down rather than attempting to resume normal server operation.
- `unhandledRejection`: emitted when a Promise rejection lacks a handler within a turn; default actions vary with Node settings and versions. Always handle rejected Promises at the appropriate boundary.

Don't use these events as substitutes for careful local error handling.

## 10. Apply T011 to your ESM Task API

Your current project already uses `http.createServer()`, `getTasks()`, `saveData()`, and JSON-file persistence. Add:

- `PORT` configuration read and validated at startup.
- `.env.example` with non-secret defaults.
- `SIGINT` / `SIGTERM` handlers with a one-time guard.
- `server.close()` and explicit logging.
- A `/slow` endpoint to demonstrate graceful shutdown.

For a future PostgreSQL version, make closing the database pool part of the shutdown sequence.

## 11. Common mistakes and corrections

| Mistake | Why it is problematic | Better approach |
|---|---|---|
| `const PORT = process.env.PORT || 3000` without validation | Malformed strings may cause unexpected behavior | Parse and validate |
| `if (process.env.DEBUG)` | The string `'false'` is truthy | Compare with `'true'` |
| Commit `.env` | May expose credentials | Ignore it, commit `.env.example` |
| `process.exit(0)` on `SIGTERM` | May interrupt pending work | Close server and resources first |
| Only call `server.close()` but ignore DB pool | Process may stay alive | Close every owned resource |
| Assume Windows signals behave exactly like Linux | OS behavior differs | Test in target deployment OS |
| Perform async cleanup in `exit` listener | Node won't await it | Use shutdown handlers |

## 12. Interview questions with answers

**Q1. What is a Node.js process?**  
A running instance of Node.js managed by the OS, with its own PID, resources, environment, and memory.

**Q2. What does `process.env` contain?**  
Environment variables visible to the current process, typically represented as strings.

**Q3. Why are environment variables useful?**  
They separate configuration from application source code, making builds easier to deploy across environments.

**Q4. Does a `.env` file automatically load in all Node.js applications?**  
No. Run with `--env-file` in supported Node.js versions, load it programmatically, or inject environment variables externally.

**Q5. What is `NODE_ENV`?**  
A commonly adopted configuration convention (often `development`, `test`, or `production`), not an OS-mandated variable.

**Q6. Why must numeric environment variables be parsed?**  
Because `process.env.PORT` is a string, not a number.

**Q7. What is the difference between `process.cwd()` and `import.meta.url`?**  
The first refers to the process working directory; the second identifies the current module's URL.

**Q8. What is `process.argv`?**  
An array containing the Node executable path, entry-script path, and supplied command arguments.

**Q9. What is a Unix/POSIX signal?**  
A notification delivered to a process, often to request termination or report an OS event.

**Q10. `SIGINT` vs `SIGTERM`?**  
`SIGINT` commonly comes from a terminal interrupt; `SIGTERM` is typically used to request orderly termination.

**Q11. Can you catch `SIGKILL`?**  
No. `SIGKILL` cannot be caught or ignored on POSIX systems.

**Q12. What does `process.on('SIGINT', ...)` do?**  
Registers a listener that Node.js invokes on the supported signal event; the handler must manage shutdown.

**Q13. What is graceful shutdown?**  
Stopping new work, finishing or canceling active work, releasing resources, and exiting cleanly.

**Q14. What does `server.close()` do?**  
Stops accepting new HTTP connections and closes the server when remaining connections have been dealt with.

**Q15. Why not use `process.exit()` immediately?**  
It can terminate the process before pending writes or requests complete.

**Q16. What is `process.exitCode`?**  
The exit code Node.js should use when the process exits normally.

**Q17. What happens if a shutdown handler is registered but does not close the server?**  
The process can keep running because the listening server remains active.

**Q18. What is the purpose of a shutdown timeout?**  
To bound waiting when requests or resources don't finish in time.

**Q19. Can asynchronous cleanup be performed in the `exit` event?**  
No. The event loop is no longer processing new asynchronous work at that point.

**Q20. What would you close on shutdown in a production backend?**  
HTTP listeners, database pools, queue consumers, telemetry exporters, and other resources owned by the process.

**Q21. Are environment variables encrypted secrets?**  
No. They are configuration values; access control and secret management remain necessary.

**Q22. Does `server.close()` guarantee every application task has finished?**  
No. Background jobs, other sockets, and external resources need explicit handling.

## 13. Coding assignments

**Beginner:** Log PID, Node version, platform, and working directory using ESM.

**Intermediate:** Build `getConfig()` that validates port and converts `ENABLE_LOGGING` from a string to a boolean.

**Intermediate:** Configure the Task API through `.env`, and verify a changed `PORT` takes effect after restart.

**Advanced:** Add `SIGINT`/`SIGTERM` handling and a five-second `/slow` route. Test graceful shutdown while the request is running.

**Senior:** Add a bounded shutdown deadline and write a short design note: what to do with active requests, WebSockets, jobs, DB connections, and health/readiness signals in production.

## 14. Revision checklist

- [ ] I can explain a Node.js process and the `process` object.
- [ ] I know `process.cwd()`, `process.argv`, `process.pid`, `process.platform`.
- [ ] I can load an `.env` file with modern Node.js.
- [ ] I validate and convert all configuration values.
- [ ] I understand why `.env` must not contain committed secrets.
- [ ] I know `SIGINT`, `SIGTERM`, `SIGKILL`, and Windows differences.
- [ ] I can implement a one-time graceful shutdown handler.
- [ ] I understand `server.close()` vs `process.exit()`.
- [ ] I know why async work cannot be awaited in the `exit` listener.
- [ ] I can explain graceful shutdown in a backend interview.

## 15. Official references

- [Node.js Process API](https://nodejs.org/api/process.html)
- [Node.js Environment Variables](https://nodejs.org/api/environment_variables.html)
- [Node.js HTTP server](https://nodejs.org/api/http.html)
- [Node.js CLI: `--env-file`](https://nodejs.org/api/cli.html#--env-fileconfig)

---

**Roadmap milestone:** T011 — Environment and Process Signals.  
**Next topic:** T012 — Express 5 + TypeScript Setup.
