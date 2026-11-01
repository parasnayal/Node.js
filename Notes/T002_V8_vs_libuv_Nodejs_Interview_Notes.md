# T002 — V8 vs libuv: Node.js Internals

**Roadmap:** Backend + AI Engineering — 24-Week Interactive Roadmap  
**Phase:** Node.js Foundations (Weeks 1–2)  
**Level:** Intermediate → Advanced  
**Goal:** Explain how JavaScript execution, asynchronous I/O, the event loop, and worker pools cooperate in Node.js.

---

## 1. Quick mental model

- **V8** is the JavaScript engine. It parses, compiles, and executes JavaScript and manages JavaScript memory.
- **libuv** is a native cross-platform library used by Node.js for event-loop infrastructure, asynchronous I/O, timers, OS event notification, and its thread pool.
- **Node.js** integrates V8, libuv, Node APIs, native bindings, and the operating system.
- **OS** provides low-level sockets, file operations, scheduling, and threads.

> Interview answer: V8 runs JavaScript; libuv helps Node.js coordinate asynchronous I/O. libuv does **not** execute JavaScript callbacks—Node.js invokes them through V8.

### Conceptual architecture

```text
                JavaScript application
              (Express, modules, callbacks)
                         |
                   Node.js APIs
                         |
              Node.js native bindings
                   /           \
                  /             \
               V8               libuv
       JS execution, heap      Event loop,
       JIT, garbage collector  I/O polling, timers,
                               thread pool
                                   |
                            Operating system
```

This diagram illustrates responsibilities, **not** a strict one-way execution sequence.

## 2. V8 vs libuv at a glance

| Concern | V8 | libuv |
|---|---|---|
| Main role | Execute JavaScript | Coordinate native asynchronous operations |
| Primarily written in | C++ | C |
| Parse JavaScript | Yes | No |
| JIT compilation | Yes | No |
| Garbage collection | Yes | No |
| Node event-loop phases | No | Yes, provides underlying loop |
| Native I/O thread pool | No | Yes |
| Execute user JS callbacks | Yes, via Node.js | No |

## 3. V8 internals

### 3.1 Execution pipeline (simplified)

```text
JavaScript source
      ↓
Parser → Abstract Syntax Tree (AST)
      ↓
Ignition bytecode / interpretation
      ↓
Optional optimized compilation tiers
(Sparkplug, Maglev, TurboFan)
      ↓
Machine-code execution
```

Not every function goes through every optimization tier. V8 can also **deoptimize** when assumptions about types or shapes no longer hold.

```js
function add(a, b) {
  return a + b;
}

console.log(add(10, 20));       // 30
console.log(add('Hello', '!')); // Hello!
```

`+` can mean numeric addition or string concatenation. Engine optimizations depend on observed behavior; different types can change optimized code paths.

### 3.2 Call stack

V8 executes JavaScript functions through execution contexts and a call stack. Long-running synchronous code prevents the main JavaScript thread from processing other callbacks.

```js
function first() { second(); }
function second() { third(); }
function third() { console.log('running'); }
first();
```

### 3.3 Heap and garbage collection

V8 allocates JavaScript objects and manages memory with garbage collection. Unreachable objects are eligible for collection, but retained references (for example, in caches or listeners) can lead to memory leaks.

```js
let object = { largeData: new Array(1000).fill('data') };
object = null; // Previous object may now be collectible
```

**Interview pitfall:** It is overly simplistic to say *all* primitives live on the stack and *all* objects live on the heap; engine storage is optimized.

## 4. libuv internals

libuv provides the event loop, timers, asynchronous I/O integration, OS notification mechanisms, and a shared native thread pool.

### 4.1 Two important I/O mechanisms

**Operating-system I/O readiness / polling:** Common for networking, such as sockets and HTTP connections. Node.js can manage many connections without assigning a dedicated JavaScript thread to each.

**libuv thread pool:** Used for selected native operations that cannot be handled with the same readiness approach. Examples include many asynchronous filesystem APIs, `crypto.pbkdf2()`, and `dns.lookup()`.

> Not every asynchronous Node.js operation runs in the thread pool.

### 4.2 Asynchronous file-read flow

```js
import fs from 'node:fs';

console.log('Start');

fs.readFile('data.txt', 'utf8', (err, data) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(data);
});

console.log('End');
```

If the file exists, `Start` and `End` are printed synchronously before the file-read callback.

```text
V8 runs fs.readFile(...) call
       ↓
Node native interface submits filesystem work
       ↓
libuv thread pool performs operation
       ↓
I/O completion becomes available to Node.js
       ↓
Node invokes JS callback using V8
```

### 4.3 libuv thread-pool size

- Default libuv pool size is typically **4 threads**.
- Set `UV_THREADPOOL_SIZE` **before Node initializes the pool** to configure it.
- Increasing the pool size does not automatically improve performance; CPU contention and workload characteristics matter.
- `worker_threads` are **not the same** as libuv worker-pool threads.

## 5. Why CPU work can block the server

```js
console.log('Start');

const start = Date.now();
while (Date.now() - start < 3000) {
  // Synchronous CPU work
}

console.log('End');
```

The loop occupies the main JavaScript thread for about three seconds. libuv does not automatically move arbitrary JavaScript loops to background threads.

```js
async function work() {
  const start = Date.now();
  while (Date.now() - start < 3000) {}
}

work();
console.log('Ready'); // Runs only after the loop completes
```

**Key point:** `async` makes a function return a Promise; it does **not** automatically offload synchronous CPU computation.

For heavy JavaScript calculations, consider `node:worker_threads` or a separate processing service.

## 6. Concurrency vs parallelism

- **Concurrency:** Multiple operations are in progress during overlapping intervals.
- **Parallelism:** Operations actually execute simultaneously on multiple execution resources.

Node.js can handle large numbers of concurrent network requests using non-blocking I/O while the main JavaScript thread executes one callback at a time. Threads, processes, and native operations can provide genuine parallelism elsewhere in the system.

**Example:** 1,000 requests waiting for database responses do not require 1,000 JavaScript threads. Throughput is still limited by connection pools, database capacity, CPU, memory, and other factors.

## 7. Practical experiment: libuv thread pool

Save as `threadpool-demo.js`:

```js
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

const start = performance.now();

for (let i = 1; i <= 6; i++) {
  crypto.pbkdf2('password', 'salt', 500000, 64, 'sha512', () => {
    const elapsed = Math.round(performance.now() - start);
    console.log(`Task ${i}: ${elapsed} ms`);
  });
}
```

Run it:

```bash
node threadpool-demo.js
```

With a larger pool, macOS/Linux:

```bash
UV_THREADPOOL_SIZE=6 node threadpool-demo.js
```

Windows PowerShell:

```powershell
$env:UV_THREADPOOL_SIZE = 6
node threadpool-demo.js
```

**Observe:** With the default pool, some tasks may finish in groups. Actual timing and order depend on your hardware and system load. A larger pool may or may not improve total time.

**Explain:** `crypto.pbkdf2()` uses native background work. JavaScript callbacks still execute through the event-loop mechanism when operations finish.

## 8. libuv pool vs Node worker threads

| Aspect | libuv thread pool | `node:worker_threads` |
|---|---|---|
| Main use | Selected native async APIs | Run JavaScript on separate threads |
| Created for each request? | No | No |
| Executes your arbitrary JS code? | No | Yes |
| Typical example | `fs.readFile`, `crypto.pbkdf2` | CPU-intensive calculations |
| Communication | Async callback/Promise API | Messaging and supported shared memory |

Basic worker creation:

```js
import { Worker } from 'node:worker_threads';

const worker = new Worker('./worker.js');
worker.on('message', (result) => console.log(result));
worker.on('error', console.error);
```

## 9. Interview questions with concise answers

**Q1. What is the difference between V8 and libuv?**  
V8 executes JS and manages its memory; libuv supports Node's event loop, timers, asynchronous I/O, and native worker pool.

**Q2. Does libuv execute JavaScript callbacks?**  
No. Node.js schedules and invokes callbacks through V8.

**Q3. Does every asynchronous API use the libuv thread pool?**  
No. Network I/O commonly uses OS event notification; selected filesystem, DNS, and crypto tasks use the pool.

**Q4. Is Node.js single-threaded?**  
Main-thread JavaScript execution is typically single-threaded, but Node.js also uses native/background threads and supports `worker_threads`.

**Q5. Why can an Express route block other requests?**  
Long synchronous CPU work occupies the main JS thread, delaying other callbacks.

**Q6. Does `async/await` create a new thread?**  
No. It structures Promise-based asynchronous control flow but does not move synchronous computation to another thread.

**Q7. What is `UV_THREADPOOL_SIZE`?**  
Configuration for libuv's native worker pool; default usually 4.

**Q8. When should you use `worker_threads`?**  
When CPU-heavy JavaScript should run separately from the main event loop.

**Q9. What does JIT mean?**  
Just-in-time compilation; V8 can compile and optimize frequently executed code at runtime.

**Q10. What is deoptimization?**  
An optimized code path may be discarded if its assumptions are no longer valid.

## 10. Knowledge check

1. Which component parses and executes JavaScript: V8 or libuv?
2. Which component supplies Node.js with its native event-loop infrastructure?
3. Why doesn't `async function` prevent a synchronous loop from blocking?
4. How does network I/O differ from `crypto.pbkdf2()` in Node.js?
5. What is the difference between libuv worker-pool threads and `worker_threads`?
6. Why could increasing `UV_THREADPOOL_SIZE` hurt throughput?

<details>
<summary>Answers</summary>

1. V8.
2. libuv, integrated with Node.js.
3. `async` does not offload synchronous work.
4. Network sockets commonly use OS readiness notification; `pbkdf2()` uses native worker-pool work.
5. The libuv pool handles selected native operations; worker threads run application JavaScript in separate execution contexts.
6. Additional threads can increase CPU contention and overhead.

</details>

## 11. Hands-on checklist

- [ ] Explain V8 and libuv responsibilities without notes.
- [ ] Predict synchronous logging around `fs.readFile()`.
- [ ] Run the `pbkdf2()` pool experiment.
- [ ] Compare default vs configured thread-pool behavior.
- [ ] Explain why a CPU-heavy JavaScript loop blocks the event loop.
- [ ] Explain when worker threads would help.
- [ ] Answer all ten interview questions.

**Roadmap status:** T002 — Study notes prepared; topic completion not yet recorded.

**Next topic:** T003 — Event loop phases and microtasks.

## Official references

- Node.js event loop: https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick
- Node.js thread pool: https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop
- Node.js worker threads: https://nodejs.org/api/worker_threads.html
- Node.js crypto: https://nodejs.org/api/crypto.html
- libuv documentation: https://docs.libuv.org/en/stable/
- V8 documentation: https://v8.dev/docs
