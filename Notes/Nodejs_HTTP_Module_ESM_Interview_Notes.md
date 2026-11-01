# T008 — Node.js HTTP Module (ESM): Complete Study & Interview Notes

> **Roadmap:** Backend + AI Engineering — 24-Week Roadmap  
> **Topic:** T008 — HTTP module and first server  
> **Style:** Native Node.js, ES Modules (ESM), no Express  
> **Goal:** Understand how HTTP APIs operate under the hood, build a small Task API, and answer backend interviews confidently.

## 1. What is an HTTP server?

An HTTP server receives requests from clients (browsers, mobile apps, other services) and sends responses according to the HTTP protocol.

```text
Browser / React fetch()
      | GET /tasks
      v
Node.js HTTP server
      | HTTP/1.1 200 OK + JSON
      v
Browser receives tasks
```

HTTP is an **application-layer** protocol. The built-in `node:http` module provides HTTP/1.x server/client functionality. The transport commonly uses TCP; HTTP/2 and HTTP/3 involve different protocol implementations.

### HTTP request anatomy

```http
POST /tasks HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{"title":"Learn Node.js"}
```

- **Method:** what the client intends (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
- **Path:** requested resource (`/tasks`).
- **Headers:** metadata (`Content-Type`, `Authorization`, etc.).
- **Body:** optional payload (JSON, file bytes, form data, etc.).

### HTTP response anatomy

```http
HTTP/1.1 201 Created
Content-Type: application/json

{"status":"OK","data":{"id":1,"title":"Learn Node.js","completed":false}}
```

- **Status code:** result of request.
- **Headers:** response metadata.
- **Body:** returned content (not present for `204 No Content`).

## 2. ESM project setup

```bash
mkdir node-http-learning
cd node-http-learning
npm init -y
```

Add to `package.json`:

```json
{
  "name": "node-http-learning",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  }
}
```

Use `import` instead of CommonJS `require`:

```js
import http from "node:http";
```

`node:` explicitly identifies Node.js built-in modules.

## 3. Your first server

```js
import http from "node:http";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  return res.end("Hello from Node.js!");
});

server.listen(3000, () => {
  console.log("Server: http://localhost:3000");
});
```

Run `npm run dev` and visit `http://localhost:3000`.

### Line-by-line

- `http.createServer(handler)`: creates an `http.Server`; invokes handler on each HTTP request.
- `req`: `http.IncomingMessage`, a **Readable stream** containing request method, URL, headers, and body bytes.
- `res`: `http.ServerResponse`, a **Writable stream** for status, headers, and response body.
- `res.writeHead(status, headers)`: sets/sends response headers.
- `res.write(chunk)`: sends/queues part of a response; useful for streaming.
- `res.end(optionalData)`: finishes the response; do not write after it.
- `server.listen(port, callback)`: starts accepting connections.
- `return res.end(...)`: ends response **and** exits this handler branch; prevents accidental fallthrough to another response.

## 4. `req` versus `res`

| Topic | Incoming `req` | Outgoing `res` |
|---|---|---|
| Type | `http.IncomingMessage` | `http.ServerResponse` |
| Stream | Readable | Writable |
| Method | `req.method` | — |
| URL | `req.url` | — |
| Headers | `req.headers` | `res.setHeader()` |
| Body | Read chunks | `res.write()`, `res.end()` |
| Socket | `req.socket` | Response tied to connection |

Example:

```js
const server = http.createServer((req, res) => {
  console.log(req.method);  // GET
  console.log(req.url);     // /tasks?page=2
  console.log(req.headers); // headers object
  res.setHeader("Content-Type", "application/json");
  res.statusCode = 200;
  res.end(JSON.stringify({ message: "received" }));
});
```

**Unlike Express**, native HTTP does *not* populate `req.body`, `req.params`, or `req.query` for you.

## 5. Parse the URL and implement routes

Prefer a **fixed trusted base** for parsing the request target, rather than relying on an untrusted Host header:

```js
const url = new URL(req.url, "http://localhost");
const pathname = url.pathname;
const page = url.searchParams.get("page");
```

Simple route:

```js
if (req.method === "GET" && pathname === "/health") {
  res.writeHead(200, { "Content-Type": "application/json" });
  return res.end(JSON.stringify({ status: "OK" }));
}
```

Dynamic `:id` route that does **not** accidentally match `/tasks/1/extra`:

```js
const taskRoute = pathname.match(/^\/tasks\/([^/]+)$/);
if (req.method === "GET" && taskRoute) {
  const rawId = taskRoute[1];
  // Validate ID before searching.
}
```

### Validate IDs strictly

```js
function validateTaskId(rawId) {
  if (!/^[1-9]\d*$/.test(rawId)) return null;
  const id = Number(rawId);
  return Number.isSafeInteger(id) ? id : null;
}
```

Why not `parseInt()`? `parseInt("12abc")` returns `12`, accepting invalid inputs. Distinguish **400 invalid ID** from **404 valid ID not found**.

## 6. HTTP methods and status codes

| Method | Typical use | Common success response |
|---|---|---|
| GET | Retrieve | `200 OK` |
| POST | Create | `201 Created` |
| PUT | Replace | `200 OK` / `204 No Content` |
| PATCH | Partial update | `200 OK` / `204 No Content` |
| DELETE | Delete | `204 No Content` (or `200 OK` with body) |

| Code | Meaning |
|---|---|
| 200 | Successful request |
| 201 | Resource created |
| 204 | Success, **no response body** |
| 400 | Bad input / malformed JSON |
| 404 | Resource/route not found |
| 405 | Method not allowed for existing resource |
| 413 | Request body too large |
| 500 | Unexpected server error |

For JSON responses, set `Content-Type: application/json; charset=utf-8`.

## 7. Reading a POST body: streams and EventEmitter

`req` is a readable stream, and `.on(name, listener)` registers an event listener.

```js
let body = "";
req.on("data", (chunk) => {
  body += chunk.toString();
});
req.on("end", () => {
  const payload = JSON.parse(body);
  // Validate and create task.
});
req.on("error", console.error);
```

- `data`: bytes arrive, possibly in **multiple chunks** (`Buffer` objects by default).
- `end`: request body has finished arriving and been consumed.
- `error`: a stream error occurred.
- `req.on("end", ...)` **listens** to incoming request completion.
- `res.end()` **finishes** the outgoing HTTP response.
- `.on()` registers listeners; it does **not** immediately execute them.
- Node.js EventEmitter listeners run synchronously when `.emit()` is called, but incoming network data is asynchronous.
- An `async` listener's returned Promise is **not automatically awaited** by EventEmitter.

**Character encoding caution:** `chunk.toString()` separately on each chunk may break UTF-8 characters split across chunk boundaries. For text, consider `req.setEncoding("utf8")`; for raw bytes, collect bounded Buffers or stream elsewhere.

### Safer Promise-based body reader (learning implementation)

```js
async function readJsonBody(req, maxBytes = 1_048_576) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      const err = new Error("Body too large");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error("Invalid JSON");
    err.statusCode = 400;
    throw err;
  }
}
```

This is a bounded learning helper, not a production-complete parser (you must still handle client aborts, Content-Type checks, timeouts, and resource cleanup).

## 8. Full runnable ESM Task API (in-memory)

This standalone example has no external dependencies. Data resets when the server restarts.

```js
import http from "node:http";

const tasks = [
  { id: 1, title: "Learn HTTP", completed: false },
  { id: 2, title: "Learn Streams", completed: false },
];
let nextTaskId = Math.max(0, ...tasks.map(t => t.id)) + 1;

const sendJson = (res, status, payload) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
};

function validateTaskId(rawId) {
  if (!/^[1-9]\d*$/.test(rawId)) return null;
  const id = Number(rawId);
  return Number.isSafeInteger(id) ? id : null;
}

async function readJsonBody(req, maxBytes = 1_048_576) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Malformed JSON");
    error.statusCode = 400;
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const match = url.pathname.match(/^\/tasks\/([^/]+)$/);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { status: "OK" });
    }

    if (req.method === "GET" && url.pathname === "/tasks") {
      return sendJson(res, 200, { status: "OK", data: tasks });
    }

    if (match && ["GET", "DELETE"].includes(req.method)) {
      const id = validateTaskId(match[1]);
      if (id === null) return sendJson(res, 400, { error: "Invalid task ID" });

      const index = tasks.findIndex(task => task.id === id);
      if (index < 0) return sendJson(res, 404, { error: "Task not found" });

      if (req.method === "GET") return sendJson(res, 200, { data: tasks[index] });

      tasks.splice(index, 1);
      res.writeHead(204);
      return res.end();
    }

    if (req.method === "POST" && url.pathname === "/tasks") {
      const payload = await readJsonBody(req);
      if (
        !payload || typeof payload !== "object" || Array.isArray(payload) ||
        typeof payload.title !== "string" || !payload.title.trim()
      ) {
        return sendJson(res, 400, { error: "A non-empty title is required" });
      }
      const task = { id: nextTaskId++, title: payload.title.trim(), completed: false };
      tasks.push(task);
      return sendJson(res, 201, { status: "OK", data: task });
    }

    return sendJson(res, 404, { error: "Route not found" });
  } catch (error) {
    console.error("Request failed:", error);
    if (!res.headersSent && !res.destroyed) {
      return sendJson(res, error.statusCode ?? 500, {
        error: error.statusCode ? error.message : "Internal server error",
      });
    }
    if (!res.destroyed) res.destroy(error);
  }
});

server.listen(3000, () => console.log("Listening on http://localhost:3000"));
```

**Note:** The size guard limits accumulation but isn't a complete defense against abusive clients; production APIs should also manage timeouts, aborts, limits, and validation.

### Test with curl

```bash
curl http://localhost:3000/health
curl http://localhost:3000/tasks
curl http://localhost:3000/tasks/1
curl -X POST http://localhost:3000/tasks -H "Content-Type: application/json" -d '{"title":"Build API"}'
curl -i -X DELETE http://localhost:3000/tasks/1
```

On Windows PowerShell, `curl` may be an alias in some shells; use `curl.exe` and shell-appropriate quoting, or Postman.

## 9. Adding persistent storage with `node:fs/promises`

Your T009 project replaces the in-memory list with JSON-file storage:

```js
// storage.js — if this file is in project root
import { readFile, writeFile } from "node:fs/promises";
const file = new URL("./storage/tasks.json", import.meta.url);

export async function getTasks() {
  const tasks = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(tasks)) throw new Error("Task storage must be an array");
  return tasks;
}

export async function saveTasks(tasks) {
  await writeFile(file, JSON.stringify(tasks, null, 2), "utf8");
}
```

`new URL("./storage/tasks.json", import.meta.url)` resolves relative to the module file, whereas a relative filesystem string path resolves against `process.cwd()`.

**Concurrency warning:** `getTasks()` → modify → `saveTasks()` is **not atomic**. Concurrent POST requests can read the same previous state, generate duplicate IDs, or overwrite each other's changes. This learning project isn't a substitute for a database with transactions/uniqueness guarantees.

## 10. Under the hood: HTTP, TCP, event loop, streams

```text
Browser / HTTP client
    |
    | HTTP message over a connection (usually TCP for HTTP/1.1)
    v
Operating system networking stack
    |
    v
Node.js HTTP server (built on networking facilities)
    |
    +-- IncomingMessage req (Readable stream)
    |        data -> end, with possible error/abort
    |
    +-- Your JavaScript handler executes via V8
    |
    +-- ServerResponse res (Writable stream)
    |        writeHead -> write -> end
    v
Client receives HTTP response
```

- Node.js handles many network connections through event-driven non-blocking I/O rather than allocating a JavaScript thread per request.
- The event loop coordinates callbacks. V8 executes JavaScript callback code.
- Large request/response bodies can be streamed instead of fully buffered.
- A synchronous CPU-intensive loop still blocks the main JS thread.

## 11. Common bugs and what they teach

1. **Returning in-memory `TASKS` after reading a JSON file:** return the data actually loaded from disk.
2. **`res.end()` without exiting branch:** later code might attempt another response.
3. **POST echoes payload but doesn't save:** validate, construct server-controlled fields, persist, then send `201`.
4. **`tasks.filter(task => task.id === id)` for DELETE:** does not mutate the original array. Use `findIndex()` + `splice()` or reassign a filtered array.
5. **`parseInt("1abc") === 1`:** strictly validate route parameters.
6. **Always returning `200`:** use `400`, `404`, `201`, `204`, `500` appropriately.
7. **Sending JSON with HTTP 204:** invalid design: response should have no body.
8. **No unknown-route response:** clients can be left waiting; provide a fallback.
9. **Catch all errors as "Invalid JSON":** distinguish parsing errors, validation errors, and server failures.
10. **Unbounded `req.on("data")` accumulation:** attackers can consume memory; apply limits.
11. **`Host` header as a trusted origin:** avoid unnecessary dependence on untrusted user input when parsing URL paths.
12. **Assuming async automatically means parallel:** `await` yields; your CPU-bound JS still executes on the main thread by default.

## 12. Interview questions with compact answers

**Q1. What does `http.createServer()` do?**  
Creates an HTTP server instance, with a callback invoked for incoming requests.

**Q2. What is `req`?**  
An `http.IncomingMessage`, which is a Readable stream containing request method, path, headers, and incoming body bytes.

**Q3. What is `res`?**  
An `http.ServerResponse`, a writable interface for status, headers, and outgoing data.

**Q4. Difference between `res.write()` and `res.end()`?**  
`write()` sends/queues a chunk; `end()` indicates no more response data will be written and completes the response.

**Q5. Difference between `req.on("end")` and `res.end()`?**  
The first registers a listener for the end of *incoming* data; the second finishes the *outgoing* response.

**Q6. Why do POST bodies arrive in chunks?**  
Request bodies are streams; incoming network and buffering boundaries don't guarantee one chunk per request.

**Q7. Does `node:http` parse JSON automatically?**  
No. Consume the request stream and parse JSON yourself (or use middleware in a framework).

**Q8. Why should you limit request body sizes?**  
To bound memory use and reduce denial-of-service risk.

**Q9. 400 vs 404?**  
400 for invalid request syntax/input; 404 for nonexistent resources/routes.

**Q10. When return 201?**  
After a new resource has been created successfully.

**Q11. Can a 204 response contain JSON?**  
No; a 204 response has no message body.

**Q12. Why use both method and path for routing?**  
`GET /tasks` and `POST /tasks` mean different operations on the same resource.

**Q13. What does `server.listen()` do?**  
Starts listening for incoming network connections on a port/interface.

**Q14. Does each HTTP request create a JS thread?**  
No; by default request handler JS runs on the main JavaScript thread with asynchronous network I/O.

**Q15. What is an error-first callback?**  
A common Node callback convention with `err` as the first argument, followed by successful result data.

**Q16. What happens if an `async` HTTP handler throws?**  
Native HTTP doesn't automatically turn every rejected Promise into a well-formed 500 response; handle rejections explicitly.

**Q17. How is an HTTP request related to EventEmitter?**  
The request stream emits events such as `data`, `end`, and `error`; `.on()` registers listeners.

**Q18. Difference between HTTP and TCP?**  
HTTP defines request/response message semantics; TCP is a byte-stream transport commonly used by HTTP/1.1.

**Q19. Why use `return res.end()`?**  
To terminate the current handler branch immediately after ending the response; `return` itself is not part of HTTP.

**Q20. When would you choose Express over native HTTP?**  
For convenient routing, middleware, parsing, and error-handling abstractions; understanding native HTTP makes these abstractions easier to debug.

## 13. Hands-on exercises

### Beginner
- Build `GET /health`, `GET /tasks`.
- Return JSON with appropriate headers.
- Add a default 404 response.

### Intermediate
- Add `GET /tasks/:id`, strict ID validation, and 404 handling.
- Add POST with request-body parsing, validation, ID generation, and 201.
- Add DELETE with 204 and no response body.

### Advanced
- Put task data in `storage/tasks.json` using `node:fs/promises`.
- Implement `GET /download` using `createReadStream()` and `pipeline()`.
- Limit POST body size and handle stream errors/aborts.
- Design a strategy to prevent concurrent file writes from losing updates.
- Add graceful shutdown with `SIGINT` / `SIGTERM` and `server.close()`.

## 14. Revision checklist

- [ ] Explain HTTP request, response, method, path, header, body.
- [ ] Build a server with `node:http` and ESM.
- [ ] Explain `IncomingMessage` and `ServerResponse`.
- [ ] Parse URL paths and query parameters.
- [ ] Handle dynamic route IDs safely.
- [ ] Explain `req.on("data")`, `req.on("end")`, and `res.end()`.
- [ ] Distinguish 200 / 201 / 204 / 400 / 404 / 500.
- [ ] Handle malformed JSON and invalid payloads.
- [ ] Return once per request; avoid hanging connections.
- [ ] Persist tasks using async filesystem functions.
- [ ] Explain why a JSON file can suffer concurrent-write races.
- [ ] Explain HTTP's relationship with TCP, streams, and the event loop.

## 15. Official documentation

- [Node.js HTTP API](https://nodejs.org/api/http.html)
- [Node.js Streams](https://nodejs.org/api/stream.html)
- [Node.js Buffer](https://nodejs.org/api/buffer.html)
- [Node.js FS Promises](https://nodejs.org/api/fs.html#promises-api)
- [Node.js Event Loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)

---

**Next roadmap topic after T008:** T009 — `fs` and `path` modules.  
**Your later follow-up:** T010 — Streams and Buffers, T011 — Environment Variables and Process Signals.
