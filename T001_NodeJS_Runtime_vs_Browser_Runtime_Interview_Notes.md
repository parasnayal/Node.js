# Node.js Runtime vs Browser Runtime — Interview Notes

**Roadmap:** Backend + AI Engineering, 24-Week Interactive Roadmap  
**Phase:** Node.js Foundations (Weeks 1–2)  
**Topic:** T001 — Node runtime vs browser  
**Audience:** Mid-level / Senior Frontend and Backend interviews

## 1. What is a JavaScript runtime?

A **JavaScript runtime** is the environment in which JavaScript executes. It combines a **JavaScript engine** with **host-provided APIs**, scheduling mechanisms, and platform integrations.

- **ECMAScript** specifies the JavaScript language.
- A **JavaScript engine** parses, compiles, and executes JavaScript.
- A **runtime/host environment** makes features such as timers, network I/O, and file-system access available.

```js
console.log('Hello World'); // Browser and Node.js
```

```js
document.querySelector('#app'); // Browser DOM, not standard Node.js
```

```js
import fs from 'node:fs';
console.log(fs.readFileSync('data.txt', 'utf8')); // Node.js, not standard browser JS
```

**Interview one-liner:** *JavaScript defines the language; the runtime determines the additional capabilities available to that code.*

## 2. Runtime architecture

### Browser (conceptual)

```text
JavaScript application
       |
JavaScript engine (V8 in Chrome, SpiderMonkey in Firefox, JSC in Safari)
  |-- Call stack
  |-- Managed heap
  |-- Garbage collection
       + Browser host services
           |-- DOM, Fetch, timers, storage, events
           |-- Event loop, task queue, microtask queue
           |-- Rendering: style, layout, paint, composite
```

### Node.js (conceptual)

```text
JavaScript application
       |
V8 JavaScript engine
  |-- Call stack
  |-- Managed heap
  |-- Garbage collection
       + Node.js runtime
           |-- Node APIs: fs, http, net, process, streams, crypto
           |-- Native bindings / operating system
           |-- libuv: event loop, asynchronous I/O, thread pool
           |-- Optional worker_threads for parallel JavaScript work
```

> These diagrams describe cooperating components, not a strict linear call chain.

## 3. Core components common to JavaScript runtimes

### 3.1 JavaScript engine

An engine executes JavaScript instructions. Common engines:

| Engine | Typical environment |
|---|---|
| V8 | Chrome, Node.js |
| SpiderMonkey | Firefox |
| JavaScriptCore | Safari / WebKit |
| Chakra | Legacy Microsoft Edge |

V8 conceptually follows **source → parsing/AST → bytecode → execution and optimized machine code**. **Ignition** handles bytecode interpretation; modern V8 also uses compilation tiers such as **Sparkplug**, **Maglev**, and **TurboFan**.

**Interview trap:** V8 alone does *not* provide Node's HTTP server, filesystem I/O, or the browser DOM.

### 3.2 Call stack

The call stack records active function calls; its ordering is **last in, first out (LIFO)**.

```js
function first() { second(); }
function second() { third(); }
function third() { console.log('Third'); }
first();
```

At the moment `third` executes:

```text
TOP    third()
       second()
       first()
BOTTOM global code
```

Unbounded recursive calls can exhaust the stack:

```js
function repeat() { repeat(); }
repeat(); // RangeError: Maximum call stack size exceeded
```

### 3.3 Heap memory

The engine allocates objects and other dynamic data in managed memory.

```js
const user = { name: 'Alex', age: 25 };
```

The binding `user` refers to an object. Avoid the oversimplification that *all primitives live on the stack and all objects live on the heap*; engines may optimize representation and storage.

### 3.4 Garbage collection

JavaScript engines reclaim memory when values become **unreachable**.

```js
let user = { name: 'Alex' };
user = null; // The old object may be collectible if nothing else refers to it.
```

V8 uses tracing and generational garbage-collection techniques. Automatic collection does **not** prevent memory leaks if code keeps unnecessary references (for example, global arrays, caches, or event listeners).

## 4. Browser runtime components

### 4.1 Browser Web APIs

| API | Role |
|---|---|
| DOM | Read/change page structure |
| Fetch | Make network requests |
| Timers | Schedule callbacks |
| Web Storage | Store key–value data |
| Geolocation | Request location, subject to permission |
| Web Workers | Run JavaScript on other threads |
| Intersection Observer | Observe element visibility/intersection |
| requestAnimationFrame | Coordinate callbacks with rendering |

The browser provides `document`; Node.js does not supply a DOM by default.

### 4.2 Task queue, microtask queue, event loop

Browser scheduling distinguishes **tasks** (such as timer callbacks) and **microtasks** (such as Promise handlers). After currently running synchronous code, microtasks run at the appropriate checkpoint before the next task.

```js
console.log('A');
setTimeout(() => console.log('B'), 0);
Promise.resolve().then(() => console.log('C'));
console.log('D');

// A
// D
// C
// B
```

A zero-millisecond timeout means **eligible to be scheduled**, not **run instantly**.

### 4.3 Browser rendering

Browser rendering involves **HTML/DOM**, **CSS/CSSOM**, **style calculation**, **layout**, **paint**, and **compositing**. Long synchronous JavaScript on the main thread can delay responsiveness and rendering.

```js
async function heavyWork() {
  const end = performance.now() + 3000;
  while (performance.now() < end) {
    // Busy loop: still blocks the main thread despite 'async'.
  }
}
```

**Interview point:** `async` / `await` does not automatically make CPU work non-blocking. Consider chunking work or moving suitable CPU-heavy work into a **Web Worker**.

## 5. Node.js runtime components

### 5.1 Built-in Node.js APIs

| Module | Role |
|---|---|
| `node:fs` | Read/write files |
| `node:path` | Work with filesystem paths |
| `node:http` | HTTP servers and clients |
| `node:net` | TCP sockets |
| `node:crypto` | Cryptographic primitives |
| `node:stream` | Process data incrementally |
| `node:process` | Process information and signals |
| `node:worker_threads` | Parallel JavaScript execution via workers |

Modern Node.js also provides several Web-compatible APIs, including `fetch`, so **browser API vs Node API** is not an absolute either/or division.

### 5.2 libuv

**libuv** is a cross-platform native library that supplies much of Node.js's event-loop and asynchronous-I/O infrastructure.

It supports OS-level readiness/completion notifications for networking and uses a **thread pool** for certain work, including many filesystem operations. **Not every async operation creates a new thread.**

```js
import fs from 'node:fs';
console.log('1');
fs.readFile('data.txt', 'utf8', (err, content) => {
  if (err) throw err;
  console.log('3', content);
});
console.log('2');
// Assuming success: 1 → 2 → 3 [content]
```

Conceptual flow:

```text
JavaScript calls fs.readFile()
   → Node.js API/native bindings
   → libuv starts suitable asynchronous filesystem work
   → operation completes
   → callback becomes runnable via event-loop scheduling
   → V8 executes callback JavaScript
```

### 5.3 Node.js event loop phases

| Phase | Purpose |
|---|---|
| Timers | Eligible timer callbacks |
| Pending callbacks | Certain deferred I/O callbacks |
| Idle / prepare | Internal libuv use |
| Poll | Handle I/O and potentially wait for events |
| Check | `setImmediate()` callbacks |
| Close callbacks | Certain close events |

**Important:** Promise microtasks and Node's `process.nextTick()` callbacks are **not** ordinary libuv phases. Their ordering depends on execution context. Since Node.js 20, a libuv scheduling change means timers are processed after poll rather than both before and after poll; avoid claiming that `setTimeout(fn, 0)` always runs before `setImmediate(fn)`.

### 5.4 Thread pool vs worker threads

| | libuv thread pool | `worker_threads` |
|---|---|---|
| Primary use | Native asynchronous operations | Run user JavaScript in parallel |
| Who uses it? | Node internals / native APIs | Explicitly created by application code |
| Example | Many asynchronous filesystem operations | CPU-heavy calculation |
| Default count | Commonly 4, configurable via `UV_THREADPOOL_SIZE` | App-controlled |

```js
import { Worker } from 'node:worker_threads';
const worker = new Worker('./worker.js');
worker.on('message', (result) => console.log(result));
```

Creating an HTTP server does **not** create a worker thread for every incoming request.

## 6. Browser vs Node.js comparison

| Feature | Browser | Node.js |
|---|---|---|
| Main purpose | Web UI and interaction | Server-side / general-purpose execution |
| JavaScript engine | Browser-specific (Chrome uses V8) | V8 |
| DOM | Available in a web page | Not natively available |
| `fetch` | Yes | Yes, in modern versions |
| Event loop | Browser-managed | Node.js/libuv-based |
| File access | Permissioned, limited browser APIs | Filesystem APIs |
| Rendering pipeline | Yes | Not a standard built-in browser rendering pipeline |
| Parallel JS | Web Workers | Worker Threads |
| Heavy main-thread work | Can freeze UI | Can delay other requests |

## 7. Is Node.js single-threaded?

**Strong interview answer:**

> Node.js runs JavaScript on a main thread by default, but the *runtime* is not strictly single-threaded. Its non-blocking I/O uses OS mechanisms and libuv; some native work uses a worker-thread pool. Applications can also run JavaScript in additional worker threads. A CPU-heavy synchronous handler can still block the main event loop.

**Concurrency vs parallelism:**

- **Concurrency:** manage multiple operations with overlapping progress, often without running JavaScript simultaneously on one thread.
- **Parallelism:** operations actually run at the same time on different workers/cores.
- Network concurrency does not imply one thread per connection.

## 8. Senior interview scenarios

### Q1. Why can a React page freeze even in an `async` function?

`async` does not offload CPU-intensive synchronous code. A long loop occupies the browser's main thread; split the task, optimize it, or use a Web Worker.

### Q2. Why can an Express API become slow under CPU-heavy computation?

A synchronous calculation in the main Node.js thread delays event-loop progress and therefore other requests. Profile and consider worker threads, optimized algorithms, or a separate processing service.

### Q3. Why does `window is not defined` happen in Next.js?

Code is executing in an environment without the browser's `window` object, commonly during server rendering. Move browser-only interactions into an appropriate client-side lifecycle and handle SSR boundaries safely.

### Q4. How does one Node.js server manage thousands of connections?

Event-driven, non-blocking socket I/O allows many connections without a dedicated JavaScript thread for each. Throughput is still limited by CPU, memory, OS resources, and whether handlers block.

### Q5. Does V8 execute `fs.readFile()` by itself?

No. V8 executes the JavaScript call, while Node APIs/native bindings and libuv/OS facilities perform and coordinate the underlying I/O.

### Q6. Is `setTimeout(callback, 0)` guaranteed to execute immediately?

No. It schedules a callback subject to timer thresholds and event-loop work. Context affects order relative to other callbacks.

### Q7. What is the difference between a runtime and an engine?

The **engine** executes the language; the **runtime** includes the engine plus host features such as filesystem/network access, timers, and scheduling.

## 9. Practice: Predict the output

### Exercise A — browser or Node.js

```js
console.log('Start');
setTimeout(() => console.log('Timer'), 0);
queueMicrotask(() => console.log('Microtask'));
Promise.resolve().then(() => console.log('Promise'));
console.log('End');
```

**Answer:** `Start → End → Microtask → Promise → Timer`. Both microtasks run before the timer task, and their order matches their enqueue order in this example.

### Exercise B — explain the blocking problem

```js
import http from 'node:http';

http.createServer((req, res) => {
  const stop = Date.now() + 4000;
  while (Date.now() < stop) {};
  res.end('OK');
}).listen(3000);
```

**Question:** What happens if multiple requests arrive close together?

**Answer:** The busy loop blocks the main JavaScript thread. Other request handlers cannot proceed normally until the running synchronous work finishes, leading to poor latency.

## 10. Revision checklist

- [ ] Explain JavaScript **language vs engine vs runtime**.
- [ ] Describe **V8, call stack, heap, and garbage collection**.
- [ ] Describe **browser Web APIs** and **task/microtask scheduling**.
- [ ] Explain **browser rendering** and main-thread blocking.
- [ ] Describe **Node core APIs, libuv, event-loop phases**.
- [ ] Differentiate **libuv thread pool** from **worker_threads**.
- [ ] Explain how Node.js handles concurrent connections.
- [ ] Solve and explain both code exercises without looking.
- [ ] Answer the seven interview questions aloud.

**Next roadmap topic:** **T002 — V8 and libuv mental model**, followed by **T003 — Event loop phases and microtasks**.

## Official references

- [Node.js: The event loop, timers and `nextTick()`](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)
- [Node.js: Don't block the event loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)
- [Node.js: Worker threads](https://nodejs.org/api/worker_threads.html)
- [MDN: JavaScript execution model](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model)
- [V8 JavaScript engine](https://v8.dev/)
