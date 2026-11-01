# Node.js Events and EventEmitter — Study Notes

> Practical notes with native Node.js ESM examples, based on the Task Manager API exercises.

## 1. What is an event?

An **event** is a named signal that something happened, such as `taskCreated`, `taskDeleted`, `request`, `data`, or `end`.

- **Emitter:** the object that announces an event.
- **Listener (handler):** a callback registered to react to that event.
- **Payload:** optional data passed to listeners when an event is emitted.

An event is **not** automatically an asynchronous operation.

## 2. EventEmitter basics

`EventEmitter` is a built-in Node.js class from `node:events`. It supports registering listeners and emitting named events.

```js
import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();

emitter.on('taskCreated', (task) => {
  console.log('Created:', task.title);
});

emitter.emit('taskCreated', { id: 1, title: 'Learn Node.js' });
```

**Output:** `Created: Learn Node.js`

`emit()` invokes matching listeners **synchronously**, in registration order, unless a listener itself schedules asynchronous work.

## 3. Essential EventEmitter methods

| Method | Purpose | Example |
| --- | --- | --- |
| `on(event, listener)` | Register a listener that stays registered | `emitter.on('task', handler)` |
| `once(event, listener)` | Register a listener removed when first invoked | `emitter.once('task', handler)` |
| `emit(event, ...args)` | Invoke registered listeners; returns `true` if listeners exist | `emitter.emit('task', task)` |
| `off(event, listener)` | Remove **one** matching listener registration | `emitter.off('task', handler)` |
| `removeAllListeners(event?)` | Remove all listeners for one event, or all events | `emitter.removeAllListeners('task')` |
| `listenerCount(event)` | Count registrations | `emitter.listenerCount('task')` |
| `listeners(event)` | Inspect registered listener functions | `emitter.listeners('task')` |
| `eventNames()` | List event names with listeners | `emitter.eventNames()` |
| `setMaxListeners(n)` | Adjust listener-count warning threshold | `emitter.setMaxListeners(20)` |

**Important:** `setMaxListeners()` does not fix a memory leak and does not impose a hard cap.

## 4. Multiple listeners and registration order

```js
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();

emitter.on('task', () => console.log('Notification'));
emitter.on('task', () => console.log('Analytics'));
emitter.emit('task');
```

Output:

```text
Notification
Analytics
```

Both listeners execute, in the order they were registered.

## 5. `.on()` vs `.once()` and the subtle `.off()` behavior

```js
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();

function listenerA() { console.log('A'); }
function listenerB() { console.log('B'); }

emitter.on('task', listenerA);    // registration 1
emitter.on('task', listenerB);    // registration 2
emitter.once('task', listenerA);  // registration 3

console.log(emitter.listenerCount('task')); // 3
emitter.off('task', listenerA);
emitter.emit('task');
emitter.emit('task');
```

Output:

```text
3
A
B
A
B
```

**Why?** `.once()` internally wraps the callback, while retaining a reference to the original function. `.off('task', listenerA)` searches registrations from the end and removes the **most recent matching registration**—here, the `.once()` registration. The earlier `.on('task', listenerA)` remains.

If the `.off()` line were removed, output would be `3`, then `A B A` for the first emission, and `A B` for the second.

To remove two registrations of the same function, call `.off()` twice.

**Function identity matters:**

```js
emitter.on('task', () => console.log('Hi'));
emitter.off('task', () => console.log('Hi')); // does NOT remove it
```

These two arrow functions are different objects. Keep a named or stored function reference when you need to remove a listener.

## 6. Payloads and validation

```js
emitter.on('taskCreated', (task) => {
  if (typeof task?.title !== 'string' || !task.title.trim()) {
    console.error('Invalid task title');
    return;
  }
  console.log('Task created:', task.title.trim());
});

emitter.emit('taskCreated', { id: 1, title: 'Learn Node.js' });
```

If a listener blindly reads `task.title` and you call `emit('taskCreated')` without a payload, it can throw a `TypeError`. Validate at system boundaries and, where useful, inside listeners.

## 7. Special `error` event

An emitted `error` event without an `error` listener is special: Node.js throws the error, and the process can terminate if it is uncaught.

```js
const emitter = new EventEmitter();
emitter.on('error', (error) => {
  console.error('Emitter error:', error.message);
});
emitter.emit('error', new Error('Task title is required'));
```

Having an `error` listener handles the emitted event; it does **not** automatically stop the caller or undo completed work. Return or throw explicitly as appropriate.

A synchronous exception inside an ordinary event listener interrupts `emit()` and prevents later listeners from running unless caught.

## 8. Async listeners: `emit()` does not await them

```js
const emitter = new EventEmitter();
emitter.on('task', async () => {
  console.log('A: started');
  await Promise.resolve();
  console.log('C: finished');
});

emitter.emit('task');
console.log('B: after emit');
```

Output:

```text
A: started
B: after emit
C: finished
```

The async listener begins synchronously, suspends at `await`, and resumes later via Promise microtask scheduling. **`emit()` does not wait for the returned Promise.**

Rejected Promises from async listeners require explicit handling. `new EventEmitter({ captureRejections: true })` can route rejected listener Promises to the emitter's error-handling mechanism, but you must still provide suitable error handling; it does not make event processing durable or isolate every failure.

## 9. EventEmitter vs the Node.js event loop

These are different concepts:

- **EventEmitter:** a synchronous JavaScript publish/subscribe mechanism.
- **Event loop:** coordinates when timers, I/O callbacks, and other scheduled work run.
- **Promise microtasks:** run after the current synchronous execution reaches a microtask checkpoint.

```js
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();

emitter.on('ready', () => console.log('Listener'));
console.log('Before');
emitter.emit('ready');
console.log('After');
```

Output: `Before`, `Listener`, `After`.

By contrast, a `setTimeout(callback, 0)` callback runs later, not in the current synchronous call stack.

**ESM nuance:** at top level of a Node.js ES module, a Promise callback scheduled alongside `process.nextTick()` can run first because module evaluation takes place in a microtask context. Do not memorize a single `nextTick`-vs-Promise order without considering the execution context.

## 10. How EventEmitter relates to asynchronous I/O

```js
import { readFile } from 'node:fs';
import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
emitter.on('fileLoaded', (text) => {
  console.log('Characters:', text.length);
});

console.log('Start');
readFile('./tasks.json', 'utf8', (error, text) => {
  if (error) return console.error(error);
  emitter.emit('fileLoaded', text);
});
console.log('End');
```

The file read is asynchronous (commonly using libuv's worker pool for filesystem operations). Later, Node.js runs the completion callback, which calls `emit()`. **The callback is scheduled asynchronously; the custom listener is called synchronously inside it.**

## 11. EventEmitter and HTTP servers

Node.js HTTP servers expose events, including `request`:

```js
import http from 'node:http';

const server = http.createServer();
server.on('request', (req, res) => {
  res.end('Hello');
});
server.listen(3000);
```

Networking is asynchronous; when a parsed request is ready, the server emits a `request` event and invokes registered listeners.

## 12. EventEmitter and streams

Many Node.js streams are EventEmitters:

```js
import { createReadStream } from 'node:fs';

const stream = createReadStream('./large-file.txt', {
  highWaterMark: 64 * 1024,
});

stream.on('data', (chunk) => console.log('Bytes:', chunk.length));
stream.on('end', () => console.log('Reading ended'));
stream.on('error', (error) => console.error(error.message));
```

- `data`: chunk delivered in flowing mode.
- `end`: readable side has no more data.
- `error`: something failed.

File I/O happens asynchronously, but each `data` listener invocation is synchronous.

### Async `data` listeners do not create backpressure automatically

```js
stream.on('data', async (chunk) => {
  await processChunk(chunk);
});
```

The stream **does not wait** for the Promise before delivering more chunks. `end` can fire before all `processChunk()` calls finish.

For sequential async processing, prefer:

```js
for await (const chunk of createReadStream('./large-file.txt')) {
  await processChunk(chunk);
}
```

Or use `pause()` / `resume()` carefully. For stream-to-stream operations, prefer `pipeline()` from `node:stream/promises`, which manages backpressure and errors.

For writable streams, `write(chunk) === false` means the chunk was accepted but the producer should wait for `drain` before writing more; it does **not** mean the chunk was rejected.

## 13. Practical event-driven Task Manager

Suggested structure:

```text
task-manager/
├── main.js
├── events/taskEmitter.js
├── listeners/taskListeners.js
└── services/taskService.js
```

**`events/taskEmitter.js`**

```js
import { EventEmitter } from 'node:events';
export const taskEmitter = new EventEmitter();
```

**`listeners/taskListeners.js`**

```js
import { taskEmitter } from '../events/taskEmitter.js';

export function registerTaskListeners() {
  taskEmitter.on('taskCreated', (task) => {
    console.log('Notification sent:', task.title);
  });
  taskEmitter.on('taskCreated', (task) => {
    console.log('Analytics updated:', task.id);
  });
  taskEmitter.on('taskDeleted', (task) => {
    console.log('Audit: Task', task.id, 'deleted');
  });
}
```

**`services/taskService.js`**

```js
import { taskEmitter } from '../events/taskEmitter.js';

const tasks = [];
let nextTaskId = 1;

export async function createTask(taskData) {
  if (typeof taskData?.title !== 'string' || !taskData.title.trim()) {
    throw new Error('Task title is required');
  }
  const task = {
    id: nextTaskId++,
    title: taskData.title.trim(),
    createdAt: new Date().toISOString(),
  };
  tasks.push(task); // demo only; not durable persistence
  taskEmitter.emit('taskCreated', task);
  return task;
}

export async function deleteTask(taskId) {
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index === -1) throw new Error('Task not found');
  const [task] = tasks.splice(index, 1);
  taskEmitter.emit('taskDeleted', task);
  return task;
}
```

**`main.js`**

```js
import { registerTaskListeners } from './listeners/taskListeners.js';
import { createTask, deleteTask } from './services/taskService.js';

registerTaskListeners(); // register once at startup
const task = await createTask({ title: 'Learn Node.js' });
await deleteTask(task.id);
```

Output:

```text
Notification sent: Learn Node.js
Analytics updated: 1
Audit: Task 1 deleted
```

**Design rule:** emit business events only **after successful persistence**. In this demo, storage is in-memory and disappears on restart. In a database-backed service, a durable transaction/outbox pattern may be needed for reliable event delivery.

## 14. Listener accumulation and memory leaks

**Problem:** registering listeners on a shared emitter inside every HTTP request can create duplicate work and retain unnecessary references.

```js
// BAD: called on every request
function handleRequest() {
  taskEmitter.on('taskCreated', sendNotification);
}
```

Instead, register shared listeners **once at application startup**. Use `once()` only when a single future event is desired, and remove listeners when their lifecycle ends. A `once()` listener remains registered if its event never occurs.

The default warning threshold is commonly 10 listeners per event; the warning is not a hard limit. Increasing the threshold does not repair a leak.

## 15. EventEmitter vs direct calls vs message queues

| | Direct function call | EventEmitter | Durable queue/broker |
| --- | --- | --- | --- |
| Main use | Required, explicit work | In-process notifications | Cross-process or durable background work |
| Coupling | Caller knows callee | Publisher need not know subscribers | Producers/consumers decoupled across services |
| Waits for async work | Yes, with `await` | No, not via `emit()` | Separate processing lifecycle |
| Persists events across restart | No | No | Possible with durable configuration |
| Built-in retries | Application-defined | No | Depends on queue/broker and configuration |

Use EventEmitter for local, noncritical reactions such as logging or in-process notifications. Do not assume it guarantees delivery, retries, or persistence. For critical background work (e.g., invoice email), consider a durable job queue and idempotent handlers.

## 16. Production considerations

1. **Keep registrations centralized** and avoid duplicate listeners.
2. **Validate inputs** before changing business state.
3. **Emit after successful state changes**, not before.
4. **Isolate optional listener failures** so a completed business operation is not incorrectly reported as failed.
5. **Handle async rejections**; `try/catch` without awaiting a Promise does not catch its later rejection.
6. **Avoid blocking synchronous work** inside event listeners.
7. **Understand process boundaries:** EventEmitter does not broadcast between Node.js processes, containers, or server instances.
8. **Use ESM-compatible relative imports**, typically with `.js` extensions.
9. **Test event order, listener removal, failure handling, and duplicate-registration prevention.**

## 17. Interview questions and answers

**Q1. Is EventEmitter asynchronous?**  
No. `emit()` synchronously invokes registered listeners. A listener may start asynchronous work, but `emit()` does not await it.

**Q2. Difference between `.on()` and `.once()`?**  
`.on()` persists until removed; `.once()` removes its registration when invoked the first time.

**Q3. Can one event have multiple listeners?**  
Yes. They are normally called in registration order.

**Q4. What happens if a listener throws?**  
A synchronous throw propagates out of `emit()` unless caught, interrupting later listeners.

**Q5. What happens if `error` is emitted without an error listener?**  
Node.js throws the error; without handling, the process may terminate.

**Q6. Does `.off()` remove every registration of a callback?**  
No. It removes one matching registration, choosing the most recently registered match.

**Q7. Why can EventEmitter cause memory leaks?**  
Listeners can accumulate on long-lived emitters, retaining closures and causing duplicate execution.

**Q8. How do streams use EventEmitter?**  
Streams emit lifecycle and data events such as `data`, `end`, and `error`.

**Q9. Does `async` in a `data` listener make the stream wait?**  
No. Use async iteration, explicit flow control, or stream pipelines for backpressure-aware processing.

**Q10. Can EventEmitter replace Kafka or RabbitMQ?**  
No. EventEmitter is local to one process and has no built-in durable delivery or retries.

## 18. Practice tasks

- [ ] Register two listeners for `taskCreated`, emit once, and verify both run.
- [ ] Register a function using `.on()` and `.once()`, then remove it with `.off()` and predict output.
- [ ] Validate an event payload before reading its fields.
- [ ] Demonstrate an async listener that finishes after `emit()` returns.
- [ ] Read a file and emit a custom `fileLoaded` event from the read callback.
- [ ] Build `taskCreated` and `taskDeleted` listeners in separate modules.
- [ ] Demonstrate duplicate listener registration and fix it.
- [ ] Read a file using `for await...of` and await chunk processing.

---

**One-line summary:** The event loop schedules asynchronous callbacks; EventEmitter synchronously notifies listeners; streams use events to expose incremental I/O; and backpressure keeps producers from overwhelming consumers.

## 19. Complete interview question bank — fundamentals

The following questions consolidate the questions asked throughout the lessons. Each answer is followed by the key reasoning an interviewer expects.

### Q11. What is the difference between an event, an emitter, and a listener?
An **event** is a named occurrence (`taskCreated`). An **emitter** publishes that occurrence (`taskEmitter.emit('taskCreated', task)`). A **listener** is a registered callback that responds (`taskEmitter.on('taskCreated', handler)`). The object passed to `emit()` is the event payload.

### Q12. What does `.emit()` return?
A boolean: `true` when the event has at least one registered listener; `false` otherwise. This is **not** a Promise or an indication that asynchronous work succeeded.

```js
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();
console.log(emitter.emit('missing')); // false
emitter.on('task', () => {});
console.log(emitter.emit('task')); // true
```

### Q13. Can you register the same callback multiple times?
Yes. Every `.on()` or `.once()` call creates a registration. The callback can therefore run multiple times for one emission. `.off()` removes one matching registration per call.

### Q14. What happens when you call `.emit()` with missing payload data?
`emit()` still invokes the listener. If the listener assumes `detail.title` exists and `detail` is `undefined`, it throws a `TypeError`. Validate payloads before emitting or guard against missing fields inside listeners.

```js
emitter.on('taskCreated', (detail) => {
  if (typeof detail?.title !== 'string' || !detail.title.trim()) {
    console.error('Task title is required');
    return;
  }
  console.log(detail.title);
});
```

### Q15. What is special about the `'error'` event?
If an EventEmitter emits `'error'` without an `'error'` listener, Node.js throws. With an error listener, it invokes that listener synchronously like other events. Register an error handler when using custom emitters that might emit errors.

### Q16. Is `setMaxListeners(20)` a solution to memory leaks?
No. It changes the warning threshold, not the actual number of allowed listeners. Find why listeners accumulate, register once where appropriate, and clean up subscriptions.

### Q17. What do `.listeners()`, `.eventNames()`, and `.listenerCount()` do?
- `.listeners('task')`: returns registered callback functions (for `.once()`, it exposes the original callback).
- `.eventNames()`: returns event names that currently have listeners.
- `.listenerCount('task')`: returns how many registrations exist for that event.

### Q18. What is the difference between `.off()` and `.removeAllListeners()`?
`.off(event, fn)` removes one matching registration. `.removeAllListeners(event)` removes every listener for the specified event; without an event argument it removes all listeners on that emitter. Avoid clearing listeners on shared emitters owned by other modules.

### Q19. What is the difference between a direct function call and an event?
A direct call makes the dependency explicit and can await its result. An event lets the publisher announce that something happened without importing every subscriber, but makes execution and failure paths less obvious. Use direct calls for required business work and events for suitable independent side effects.

### Q20. Does EventEmitter communicate between separate Node.js processes?
No. An EventEmitter instance exists in one process. For cross-process communication use an appropriate broker, queue, IPC mechanism, or database-backed approach.

## 20. Output-prediction questions — with answers

### Q21. `.on()`, `.once()`, and `.off()` together

```js
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();
function listenerA() { console.log('A'); }
function listenerB() { console.log('B'); }
emitter.on('task', listenerA);
emitter.on('task', listenerB);
emitter.once('task', listenerA);
console.log(emitter.listenerCount('task'));
emitter.off('task', listenerA);
emitter.emit('task');
emitter.emit('task');
```

**Answer:**
```text
3
A
B
A
B
```

**Why:** There are three registrations initially. `.once('task', listenerA)` internally registers a wrapper associated with the original function. `.off('task', listenerA)` removes the **most recently registered matching** listener — the `.once()` registration. The two persistent `.on()` listeners remain.

### Q22. What changes if `.off()` is removed from Q21?
**Answer:**
```text
3
A
B
A
A
B
```
The first emission calls all three listeners in registration order, removing the one-time listener as it runs. The second emission calls only the two persistent listeners.

### Q23. Does `emit()` wait for an async listener?

```js
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();
emitter.on('task', async () => {
  console.log('Notification started');
  await Promise.resolve();
  console.log('Notification completed');
});
console.log('Before');
emitter.emit('task');
console.log('After');
```

**Answer:**
```text
Before
Notification started
After
Notification completed
```
`emit()` calls the listener synchronously up to its first `await`. The continuation runs later as a Promise microtask. `emit()` does not await returned Promises.

### Q24. What if a synchronous listener throws?

```js
emitter.on('task', () => {
  console.log('A');
  throw new Error('Failed');
});
emitter.on('task', () => console.log('B'));
try { emitter.emit('task'); } catch { console.log('Caught'); }
```

**Answer:**
```text
A
Caught
```
`B` does not execute. The throw propagates from `emit()` and interrupts dispatch.

### Q25. What if the first listener is async and rejects?

```js
emitter.on('task', async () => {
  console.log('A');
  throw new Error('Failed');
});
emitter.on('task', () => console.log('B'));
emitter.emit('task');
console.log('C');
```

**Synchronous output:**
```text
A
B
C
```
The rejected Promise is **not caught by `emit()`**. Without rejection handling, Node.js may report an unhandled rejection or terminate depending on runtime settings. Do not run this example without a rejection handler if you want a clean demonstration.

### Q26. `process.nextTick()` vs Promise microtasks in native ESM

```js
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();
emitter.on('task', () => {
  console.log('A');
  process.nextTick(() => console.log('B'));
  Promise.resolve().then(() => console.log('C'));
});
console.log('D');
setTimeout(() => console.log('E'), 0);
emitter.emit('task');
console.log('F');
```

**Answer for top-level native ESM execution:**
```text
D
A
F
C
B
E
```
**Why:** Top-level ESM evaluation takes place in the microtask context, so the queued Promise callback runs before `nextTick` here. In a comparable top-level **CommonJS** script, `nextTick` typically runs before Promise callbacks, giving `D A F B C E`. Do not memorize one universal ordering without considering the execution context.

### Q27. Does registering a listener three times cause three notifications?
Yes. Each registration is independent. If `registerTaskListeners()` is called three times and each call registers a notification listener, one `taskCreated` emission triggers three notifications. Register application-wide listeners once at startup.

### Q28. What happens when an `async` stream `data` listener awaits?

```js
stream.on('data', async (chunk) => {
  console.log('start');
  await processChunk(chunk);
  console.log('done');
});
stream.on('end', () => console.log('end'));
```

**Answer:** The stream does **not** await `processChunk()`. Multiple `start` logs can occur before `done`, and `end` may occur before pending processing finishes. The exact interleaving depends on I/O and processing duration.

### Q29. What does `writable.write(chunk) === false` mean?
The chunk was accepted for writing/buffering, but the internal buffered amount reached the backpressure threshold. **Do not resend that chunk.** Wait for `drain` before writing more. `false` is not a failure signal.

### Q30. Does the stream `end` event mean all asynchronous processing is complete?
No. It means the readable stream has no more data to deliver. Any independent async work started in `data` handlers may still be pending. Await that work explicitly or use sequential async iteration / a backpressure-aware transform.

## 21. Event loop, I/O, and stream interview questions

### Q31. Does EventEmitter use the event loop to invoke listeners?
Not for a normal direct `emit()`: listeners are called synchronously. An asynchronous I/O callback might **call** `emit()`, but the emitter itself is not an event-loop queue.

### Q32. Explain `readFile()` + EventEmitter execution order.

```js
import { readFile } from 'node:fs';
import { EventEmitter } from 'node:events';
const emitter = new EventEmitter();
emitter.on('fileLoaded', () => console.log('File loaded'));
console.log('Start');
readFile('./tasks.json', 'utf8', (err, data) => {
  if (err) return console.error(err);
  emitter.emit('fileLoaded', data);
});
console.log('End');
```

**Expected ordering when the file exists:** `Start`, `End`, `File loaded`. Filesystem work is asynchronous; once the read callback executes, `emit()` synchronously invokes `fileLoaded` listeners.

### Q33. Is `http.Server` an EventEmitter?
Yes. `http.createServer(handler)` effectively registers a `request` listener. When Node.js has parsed an incoming HTTP request, it emits `request` with `(req, res)`.

### Q34. How do streams relate to EventEmitter?
Node.js streams expose events such as `data`, `end`, `error`, `finish`, and `drain`. The underlying I/O can be asynchronous, while each event listener is invoked synchronously when the event is emitted.

### Q35. What is backpressure?
Backpressure is flow control that prevents a faster producer from overwhelming a slower consumer. It avoids unbounded buffering and unnecessary memory growth.

### Q36. Does `highWaterMark: 64 * 1024` guarantee every chunk is exactly 64 KiB?
No. It is a buffering threshold, not a universal fixed chunk size. Actual chunk sizes can vary, especially for the final read or other stream implementations.

### Q37. How can you process stream chunks sequentially with async work?

```js
import { createReadStream } from 'node:fs';
const stream = createReadStream('./large-file.txt');
for await (const chunk of stream) {
  await processChunk(chunk);
}
console.log('All chunks processed');
```

`for await...of` waits for each iteration's processing before starting the next. The stream can still buffer internally within its configured limits.

### Q38. When should you use `pause()` and `resume()`?
When manually controlling flowing-mode `data` delivery, for example while waiting for an async chunk processor. Always handle errors; otherwise the stream may remain paused forever.

### Q39. Why use `pipeline()` instead of manual `pipe()` chains?
`pipeline()` coordinates stream backpressure, error propagation, cleanup, and completion. Prefer `node:stream/promises` when you want to `await` the whole operation.

```js
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
await pipeline(createReadStream('./a.pdf'), createWriteStream('./b.pdf'));
```

### Q40. What is the difference between readable `end`, writable `finish`, and `close`?
- `end`: no more data will be read from a readable stream.
- `finish`: all data written to a writable stream has been handed to its underlying system after `end()`.
- `close`: the stream and its underlying resource have closed. These events describe different lifecycle points.

## 22. Production scenario questions

### Q41. A task is saved, then a notification listener throws. Is the task creation successful?
The state change already occurred, but the exception can make `createTask()` reject if it propagates through `emit()`. This can mislead the API caller. Isolate noncritical side-effect failures, and define business success independently of optional notifications.

### Q42. Should you emit `taskCreated` before saving to PostgreSQL?
Generally no. Emit only after successful persistence. If durable event delivery is essential, consider a transactional outbox pattern rather than relying solely on in-memory EventEmitter.

### Q43. Can EventEmitter guarantee that a notification is sent after a server restart?
No. In-memory events are not persisted. Use a durable job queue/outbox when guaranteed eventual processing matters.

### Q44. Can `captureRejections` automatically retry failed async listeners?
No. `new EventEmitter({ captureRejections: true })` routes rejected listener Promises to the emitter's rejection handling, typically its `error` event. It does **not** await the listener, isolate every failure, or retry work. Register a safe `error` handler and avoid async `error` handlers that reject.

### Q45. How do you test EventEmitter-based business logic?
Test successful emissions, payloads, listener ordering where relevant, removal behavior, missing listeners, synchronous throws, async rejection handling, and duplicate registration. Prefer explicit injected dependencies for required operations so tests can assert outcomes without relying on global shared emitters.

### Q46. When is EventEmitter the wrong tool?
When you need durable messages, guaranteed delivery, cross-process fan-out, retries, replay, or distributed workflows. Consider a queue/broker and idempotent consumers for those requirements.

## 23. Coding interview exercises and answer checklist

### Exercise A — Two listeners and selective removal
Implement `sendNotification` and `updateAnalytics` for `taskCreated`. Print listener count before and after removing only `sendNotification`.

**Expected output:**
```text
Initial listeners: 2
Notification sent: Learn Node.js
Analytics updated: Learn Node.js
Remaining listeners: 1
Analytics updated: Learn Node.js
```

**Checklist:** Named callback references; register both once; `.off('taskCreated', sendNotification)`; emit twice.

### Exercise B — Validate payloads and emit an error
Register `taskCreated` and `error` listeners. Reject a blank title and demonstrate that a registered error listener receives the error message. Do not assume emitting `error` automatically stops execution: return or throw explicitly as appropriate.

### Exercise C — Event-driven Task Manager
Create separate `taskEmitter.js`, `taskListeners.js`, `taskService.js`, and `server.js`. Implement `createTask` and `deleteTask`, emit after successful state changes, and register listeners once at startup.

**Expected output:**
```text
Notification sent: Learn Node.js
Analytics updated: 1
Audit: Task 1 deleted
```

### Exercise D — File-read completion event
Use callback-based `readFile()` to load a file asynchronously and emit a custom `fileLoaded` event containing its content length. Explain why `Start` and `End` log before `File loaded`.

### Exercise E — Readable stream with custom events
Use `createReadStream()` and register `data`, `end`, and `error`. Emit `chunkProcessed` with each chunk size and `fileCompleted` with total bytes. Explain why synchronous chunk accounting is complete at `end` but async listener work might not be.

### Exercise F — Sequential async file processing
Use `for await...of` to process each chunk with a 500 ms delay, count chunks and bytes, handle errors, and print totals after processing. Explain how async iteration prevents overlapping processing in this loop.

### Exercise G — Backpressure-aware writable
Write many chunks to a writable stream; if `write()` returns `false`, stop producing until `drain`. Explain why you must not resend the chunk that returned `false`.

### Exercise H — Debug duplicate listeners
Simulate registering listeners inside an HTTP request handler. Observe listener counts and duplicate logs. Refactor registration to startup and explain why increasing `setMaxListeners()` is not the fix.

## 24. Fast revision sheet

| Interview prompt | Short answer |
| --- | --- |
| Is `emit()` async? | No, listener invocation is synchronous. |
| Does `emit()` await async listeners? | No. |
| `.on()` vs `.once()`? | Persistent vs one-time registration. |
| `.off()` with duplicates? | Removes the most recent matching registration only. |
| `emit()` return value? | Boolean indicating whether listeners existed. |
| Special `'error'` behavior? | Throws if no error listener exists. |
| What schedules `readFile` callback? | Node.js/libuv event-loop I/O completion machinery. |
| Does stream `end` await async `data` listeners? | No. |
| What does `write()` returning `false` mean? | Accepted, but wait for `drain` before more writes. |
| Best sequential async stream pattern? | `for await...of` with `await` inside. |
| Best stream-to-stream pattern? | `pipeline()`. |
| Does EventEmitter persist events? | No. |
| Does EventEmitter cross processes? | No. |
| What fixes listener accumulation? | Correct registration and cleanup lifecycle. |

---

**Interview study tip:** For every output question, identify (1) synchronous statements, (2) listener registration order, (3) removal semantics, (4) Promise/nextTick continuations, and (5) timers or I/O callbacks. This makes event-loop questions much easier to reason about.
