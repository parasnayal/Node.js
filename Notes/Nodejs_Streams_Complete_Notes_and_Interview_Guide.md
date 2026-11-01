# Node.js Streams — Complete Notes & Interview Guide

> **Level:** Beginner → Senior Backend Interview | **Module:** Node.js Streams | **Syntax:** ESM (`node:` imports)

## Contents
1. Mental model and motivation
2. Stream types and anatomy
3. Readable streams and lifecycle
4. Writable streams and lifecycle
5. Duplex and Transform streams
6. Buffers, encoding, chunk boundaries
7. Buffering, `highWaterMark`, and backpressure
8. Async processing: events vs `for await...of`
9. `.pipe()` and `pipeline()`
10. Async transforms, `_flush()`, and object mode
11. Errors, cancellation, cleanup, and `finished()`
12. HTTP streaming and file downloads
13. Compression and decompression
14. Streams, EventEmitter, event loop, and libuv
15. Production patterns, pitfalls, and checklist
16. Interview questions and answers (50)
17. Output-prediction exercises
18. Practical coding challenges
19. Quick revision sheet

---

## 1. Mental model: why streams?

A stream is an abstraction for **incrementally producing or consuming data**. Rather than buffering an entire 2 GB file in memory, a stream handles it in chunks. Typical uses: large downloads/uploads, logs, CSV parsing, compression, proxies, network sockets, and media delivery.

**Analogy:** A pipe delivers water continuously rather than storing an entire reservoir first. A stream does not promise a particular chunk size, and one chunk is not necessarily one line or message.

**Benefits:** bounded buffering, early processing, composability, and flow control. **Costs:** handling partial records, errors, cleanup, and backpressure correctly.

`fs.promises.readFile()` loads the whole file into a Buffer/string; `fs.createReadStream()` supplies chunks. Neither is inherently superior for every use case: for small configuration files, `readFile()` is often simpler.

## 2. Four main stream types

| Type | Role | Example |
|---|---|---|
| Readable | Produces chunks | `fs.createReadStream()`; HTTP incoming request |
| Writable | Accepts chunks | `fs.createWriteStream()`; HTTP response |
| Duplex | Readable and writable sides | TCP socket |
| Transform | Duplex whose output is derived from input | gzip, uppercase conversion |

**Every Transform is Duplex; not every Duplex is Transform.** Streams are event emitters in classic Node APIs. Common events: readable `data`, `readable`, `end`, `close`, `error`; writable `drain`, `finish`, `close`, `error`.

## 3. Readable streams

```js
import { createReadStream } from 'node:fs';

const readable = createReadStream('./input.txt', {
  highWaterMark: 64 * 1024,
});

readable.on('data', (chunk) => console.log('bytes:', chunk.length));
readable.on('end', () => console.log('No more data'));
readable.on('error', (err) => console.error('Read failed:', err));
readable.on('close', () => console.log('Underlying resource closed'));
```

Adding a `data` listener generally switches a readable into **flowing mode**. In **paused mode**, consume via `readable.read()` when `readable` fires, or use `for await...of`. Do not casually mix consumption mechanisms (`data`, `readable`, async iterator), because they affect flow state and may compete for chunks.

**`end` vs `close`:** `end` means the readable side has no more data. `close` means the stream/underlying resource was closed; it can also occur after an error or premature destruction. An error may prevent a normal `end`.

**`pause()` and `resume()`** control flowing-mode delivery, not necessarily every underlying I/O operation instantly.

## 4. Writable streams

```js
import { createWriteStream } from 'node:fs';

const writable = createWriteStream('./output.txt');
writable.write('first line\n');
writable.end('last line\n');
writable.on('finish', () => console.log('All writes flushed through stream'));
writable.on('error', console.error);
```

- `write(chunk)` accepts data into the stream and returns **a backpressure signal** (`true` or `false`), not a success/failure result.
- `false` means stop writing until `drain`; **do not resend that chunk**.
- `end()` signals no more writes. The `finish` event occurs after the writable has finished processing all written chunks.
- `close` means the resource closed; it is not interchangeable with `finish`.
- Writing after `end()` is an error (`ERR_STREAM_WRITE_AFTER_END`).

## 5. Duplex and Transform

A Duplex has independent readable and writable sides. A Transform connects them through a transformation.

```js
import { Transform } from 'node:stream';

const upper = new Transform({
  transform(chunk, encoding, callback) {
    try {
      callback(null, chunk.toString('utf8').toUpperCase());
    } catch (error) {
      callback(error);
    }
  },
});
```

`callback(null, output)` signals completion and forwards output. Alternatively, call `this.push(output)` (zero or more times) and then `callback()`. Calling the callback twice is a bug; never forget to call it. Transform input callbacks are processed serially by the built-in Transform implementation.

**Caution:** This simple `chunk.toString('utf8')` example is suitable for ASCII demonstrations; arbitrary UTF-8 can be split across chunks. See §6.

## 6. Buffers, encoding, and chunk boundaries

A Buffer represents bytes. Streams often emit Buffers by default.

```js
import { Buffer } from 'node:buffer';
const buf = Buffer.from('hello', 'utf8');
console.log(buf.length); // 5 bytes
console.log(buf.toString('utf8')); // hello
```

**Bytes ≠ characters:** `Buffer.byteLength('é', 'utf8')` is 2; emojis can be 4 bytes. A chunk may split a UTF-8 character, CSV row, JSON object, or newline.

For streaming text decoding:

```js
import { StringDecoder } from 'node:string_decoder';
const decoder = new StringDecoder('utf8');
let text = '';
for await (const chunk of readable) text += decoder.write(chunk);
text += decoder.end();
```

This preserves character boundaries but **accumulates all text**; for huge inputs, process decoded fragments incrementally instead. You can also use `readable.setEncoding('utf8')` for string chunks. For CSV/NDJSON, maintain a carry-over fragment between chunks; do not assume chunks align with rows.

## 7. `highWaterMark` and backpressure

`highWaterMark` is an **internal buffering threshold**, not a guaranteed chunk size or hard memory limit. It differs by stream and mode; do not assume every stream defaults to 64 KiB. `createReadStream()` commonly defaults to 64 KiB; generic readable streams often use different defaults, and object mode counts objects rather than bytes.

**Backpressure:** If producer is faster than consumer, slow the producer to prevent unbounded queues/memory growth. Node's `.pipe()` and `pipeline()` coordinate backpressure.

### Manual writable backpressure

```js
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';

const out = createWriteStream('./out.txt');
try {
  for (const chunk of ['hello\n', 'world\n']) {
    if (!out.write(chunk)) await once(out, 'drain');
  }
  out.end();
  await once(out, 'finish');
} catch (error) {
  out.destroy(error);
  throw error;
}
```

This illustrates `write`/`drain`; **prefer `pipeline()`** for robust real-world source-to-destination streaming. `drain` signals that the internal writable buffer has emptied sufficiently to resume writing. `write(false)` still accepted the chunk.

## 8. Async listeners vs sequential async iteration

### Pitfall: `async` data listener is not awaited

```js
readable.on('data', async (chunk) => {
  await processChunk(chunk);
});
readable.on('end', () => console.log('Input ended'));
```

`EventEmitter.emit()` invokes listeners synchronously but **ignores returned Promises**. The next chunk can arrive while previous processing is pending. `end` can fire before `processChunk()` calls finish; errors from async listeners may become unhandled rejections.

### Recommended: `for await...of`

```js
import { createReadStream } from 'node:fs';

async function processFile(path) {
  let total = 0;
  let count = 0;
  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    await processChunk(chunk); // sequential processing
    count++;
    total += chunk.length;
    console.log(`Chunk ${count}: ${chunk.length} bytes`);
  }
  console.log(`Completed ${total} bytes`);
}
```

The iterator waits before requesting the next chunk for the loop body; internal read-ahead buffering can still occur. You can manually `pause()` before async work and `resume()` afterward, but must handle failures and destruction. Do not confuse sequential processing with guaranteed durable completion.

## 9. `.pipe()` vs `pipeline()`

```js
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

await pipeline(
  createReadStream('./input.txt'),
  createWriteStream('./copy.txt')
);
```

Both connect streams and support backpressure. `pipeline()` adds coordinated error propagation, cleanup/destruction, and a Promise that resolves when the pipeline completes. Prefer it for file processing and production pipelines. `.pipe()` returns the destination and requires more careful error/cleanup handling.

**Pipeline completion** means the stream chain finished according to stream semantics, not necessarily that bytes are permanently persisted to physical storage (`fsync` is a separate durability concern).

## 10. Async transforms, `_flush()`, and object mode

### Safe async transform

```js
import { Transform } from 'node:stream';
const transform = new Transform({
  transform(chunk, enc, callback) {
    Promise.resolve()
      .then(() => processChunk(chunk))
      .then((result) => callback(null, result), callback);
  },
});
```

An `async transform(chunk, enc, callback)` method is **not automatically awaited by the callback-based Transform contract**. On rejection, it can fail to invoke `callback`, hanging processing and causing unhandled rejection. Bridge the Promise to the callback as above.

### `_flush()` for remaining buffered state

```js
const suffix = new Transform({
  transform(chunk, enc, cb) { cb(null, chunk); },
  flush(cb) { cb(null, '\n--END--\n'); },
});
```

`flush()` runs when the writable input ends, before the readable side finishes. Useful for trailing records, decoder leftovers, or final summaries.

### Object mode

```js
const stringify = new Transform({
  writableObjectMode: true,
  transform(obj, enc, cb) {
    cb(null, JSON.stringify(obj) + '\n');
  },
});
```

Object-mode chunks can be JS objects; the buffering threshold counts **objects**, not bytes. A Transform can have object mode on one side only.

## 11. Errors, cancellation, cleanup, and `finished()`

```js
import { finished } from 'node:stream/promises';
import { createReadStream } from 'node:fs';

const stream = createReadStream('./input.txt');
stream.resume(); // consume data so it can finish
try {
  await finished(stream);
  console.log('Stream completed');
} catch (error) {
  console.error('Stream failed:', error.message);
}
```

`finished()` observes completion/failure; it does not itself consume a readable. For connected streams, `pipeline()` is usually the better choice. Always handle `error`, premature close, client disconnects, and aborts. For cancellation, many APIs accept `AbortSignal`:

```js
const controller = new AbortController();
await pipeline(source, transform, destination, { signal: controller.signal });
```

Calling `controller.abort()` elsewhere causes cancellation and rejection. Be mindful of resource ownership; destroying a shared stream may affect other users.

## 12. HTTP streaming: downloading a PDF

```js
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

const path = './report.pdf';
const server = http.createServer(async (req, res) => {
  if (req.url !== '/download' || req.method !== 'GET') {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const info = await stat(path);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="report.pdf"',
      'Content-Length': info.size,
    });
    await pipeline(createReadStream(path), res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500).end('Download failed');
    else res.destroy(error);
  }
});
server.listen(3000);
```

**Headers:** `Content-Type` describes MIME type; `Content-Disposition: attachment` asks browser to download; `inline` permits viewer display where supported; `Content-Length` is byte size (optional for streaming). Real apps should validate authorization, prevent path traversal, handle missing files before sending headers, support range requests for video/PDF seeking if needed, and handle client disconnects. The example is educational: a file can disappear between `stat()` and opening the stream.

## 13. Compression and decompression

```js
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

await pipeline(createReadStream('./report.txt'), createGzip(), createWriteStream('./report.txt.gz'));
await pipeline(createReadStream('./report.txt.gz'), createGunzip(), createWriteStream('./restored.txt'));
```

`zlib` compression streams transform bytes incrementally. Already-compressed inputs may not shrink. Always validate content and size limits when accepting untrusted compressed uploads (decompression bombs).

## 14. How Streams relate to EventEmitter, event loop, and I/O

1. `createReadStream()` initiates file reads (commonly through libuv's worker pool for filesystem operations).
2. When I/O completes, Node.js processes the completion callback through its runtime/event-loop machinery.
3. The stream manages its buffers and may `emit('data', chunk)` in flowing mode.
4. `EventEmitter.emit()` **synchronously invokes** each `data` listener; it does not schedule or await them.
5. Network sockets commonly use OS readiness notifications instead of the filesystem worker pool.
6. Heavy synchronous listeners block the main JS thread; `await` yields JS execution but does not make CPU-heavy work nonblocking.

**Mental model:** Async I/O gets data → runtime schedules callbacks → streams organize chunks/flow → EventEmitter notifies subscribers.

## 15. Production checklist and common mistakes

- Prefer `pipeline()` for connecting streams and handling errors.
- Prefer `for await...of` for sequential async processing.
- Do not assume chunks are complete messages or lines.
- Do not treat `highWaterMark` as a hard memory cap or exact chunk size.
- Respect `write() === false` and wait for `drain` when writing manually.
- Do not mistake `end` (readable) for `finish` (writable) or `close` (resource).
- Do not assume async EventEmitter listeners are awaited.
- In callback-based Transform, call callback exactly once on success or error.
- Validate content type, input sizes, permissions, and file paths.
- Handle early client disconnects, cancellation, and resource cleanup.
- Test slow consumers, malformed input, split UTF-8/records, and injected I/O failures.
- For required background tasks with retries/durability, consider a job queue rather than EventEmitter alone.

---

# 16. Stream interview questions and answers (50)

### Foundations

**Q1. What is a stream in Node.js?** Incremental data production/consumption through a standard interface, usually with bounded buffering.

**Q2. Why use streams instead of `readFile()`?** For large or ongoing data, they avoid buffering the whole payload and can begin processing immediately.

**Q3. When should you avoid streams?** Small files or operations needing the entire payload, where simpler whole-buffer APIs are adequate.

**Q4. Name four stream types.** Readable, Writable, Duplex, Transform.

**Q5. Is a Transform a Duplex?** Yes. A Transform is a Duplex with output related to input.

**Q6. Is a TCP socket a Transform?** Not by default; it is Duplex.

**Q7. What is a Buffer?** A byte sequence; many binary-mode streams deliver Buffers.

**Q8. Does one chunk equal one line?** No. Chunk boundaries are arbitrary relative to logical records.

**Q9. What is flowing mode?** Readable pushes data through `data` events as it becomes available.

**Q10. What is paused mode?** Consumer pulls data via `read()`/`readable`, or consumes through async iteration.

### Lifecycle and API

**Q11. What does readable `end` mean?** No more data is available from the readable side.

**Q12. What does writable `finish` mean?** All supplied writes have been processed and the writable side has ended.

**Q13. What does `close` mean?** Underlying stream/resource has closed; it can happen after completion or premature termination.

**Q14. What does `error` mean?** A stream operation failed; errors require handling.

**Q15. What does `writable.end()` do?** Signals no further chunks will be written and starts finalization.

**Q16. What if you write after `end()`?** It is invalid and typically causes `ERR_STREAM_WRITE_AFTER_END`.

**Q17. What does `destroy()` do?** Aborts/tears down a stream, usually closing its resources and potentially emitting an error.

**Q18. What is `finished()`?** A utility to await stream completion or failure; it does not consume the stream.

**Q19. What is `setEncoding('utf8')` for?** Decodes Buffer chunks into strings while preserving multibyte character boundaries.

**Q20. What is `StringDecoder`?** A stateful decoder that handles multibyte characters split across Buffers.

### Backpressure and performance

**Q21. Define backpressure.** Feedback that slows a producer when downstream consumption cannot keep up.

**Q22. What is `highWaterMark`?** An internal buffering threshold, not a guaranteed chunk size or strict memory limit.

**Q23. Is `highWaterMark` always 64 KiB?** No. Defaults depend on stream type, implementation, and object mode.

**Q24. What does `writable.write()` returning `false` mean?** Chunk accepted; stop writing and wait for `drain`.

**Q25. Should you retry the chunk after `write(false)`?** No; it was already accepted.

**Q26. What does `drain` mean?** Buffered writable data has drained sufficiently to resume writing.

**Q27. Does `.pipe()` handle backpressure?** Yes, for the connected streams.

**Q28. Does `pipeline()` handle backpressure?** Yes, plus coordinated error/cleanup handling.

**Q29. What if a `data` handler performs CPU-heavy synchronous work?** It blocks the main JS thread and delays other callbacks.

**Q30. Can streams use lots of memory despite `highWaterMark`?** Yes, through queued async work, multiple streams, oversized chunks, or downstream buffering.

### Async and event loop

**Q31. Does EventEmitter await async `data` listeners?** No; `emit()` does not await returned Promises.

**Q32. Can `end` fire before async data processing finishes?** Yes, if processing is started inside unawaited async listeners.

**Q33. How do you process chunks sequentially with async work?** Use `for await (const chunk of readable) { await work(chunk); }`.

**Q34. Does `for await...of` stop all underlying read-ahead?** No; internal buffering can continue within thresholds.

**Q35. Does `pause()` instantly cancel all underlying I/O?** No; it controls delivery in flowing mode, not necessarily already scheduled reads.

**Q36. Is `emit('data')` itself an asynchronous event-loop task?** No; listener invocation is synchronous, even when the event is triggered by async I/O.

**Q37. Where does filesystem async I/O usually run?** Many Node filesystem operations use libuv's worker pool.

**Q38. How are sockets different?** Network I/O commonly uses OS readiness notification mechanisms.

**Q39. Does `await` make CPU-intensive code nonblocking?** No; synchronous CPU work still blocks its executing thread.

**Q40. How do you cancel a pipeline?** Use an `AbortSignal` supported by `pipeline()` or destroy owned streams appropriately.

### Transforms and production

**Q41. What does `transform(chunk, encoding, callback)` do?** Processes an input chunk and signals completion, optionally producing output.

**Q42. What does `callback(null, output)` mean?** Successful transform with output chunk.

**Q43. Can one input chunk produce multiple output chunks?** Yes, with repeated `this.push()` calls.

**Q44. Can a transform drop chunks?** Yes; call `callback()` without output when appropriate.

**Q45. Does Node await an `async transform()` return value?** Not in the callback-based Transform contract; handle Promise fulfillment/rejection and invoke callback.

**Q46. What is `_flush()` / `flush()` for?** Final output or buffered leftovers before the readable side ends.

**Q47. What is object mode?** A stream mode that passes JavaScript values rather than only byte/string chunks; buffer thresholds count objects.

**Q48. `.pipe()` vs `pipeline()`?** Both connect streams and manage flow; pipeline adds coordinated error propagation, cleanup, and completion Promise (promises variant).

**Q49. How do you stream a PDF download?** Set response headers, create a file readable, and pipe/pipeline into HTTP response; handle missing files and disconnects.

**Q50. Why are streams useful for CSV uploads?** Process rows incrementally with bounded buffering; parser must preserve records split across chunks and apply validation/limits.

---

# 17. Output-prediction interview exercises

## Exercise A: EventEmitter listener is synchronous

```js
import { EventEmitter } from 'node:events';
const e = new EventEmitter();
e.on('data', () => console.log('B'));
console.log('A');
e.emit('data');
console.log('C');
```

**Output:** `A`, `B`, `C`. `emit()` calls listeners immediately.

## Exercise B: Async listener is not awaited

```js
import { EventEmitter } from 'node:events';
const e = new EventEmitter();
e.on('data', async () => {
  console.log('start');
  await Promise.resolve();
  console.log('done');
});
e.emit('data');
console.log('after');
```

**Output:** `start`, `after`, `done`. Async continuation runs in a microtask.

## Exercise C: `end` vs `finish`

```js
import { PassThrough } from 'node:stream';
const s = new PassThrough();
s.on('data', (c) => console.log(c.toString()));
s.on('end', () => console.log('readable end'));
s.on('finish', () => console.log('writable finish'));
s.end('hello');
```

**Concept:** Both sides eventually complete, but `finish` describes writable completion and `end` readable completion. Avoid assuming a universal ordering of all lifecycle events in arbitrary pipelines.

## Exercise D: `write(false)`

```js
const ok = writable.write(chunk);
if (!ok) console.log('slow down');
```

**Question:** Was the chunk rejected? **No.** It was accepted; wait for `drain` before more writes.

## Exercise E: Chunk boundaries

**Question:** A file contains `hello\nworld\n`; can one `data` event contain only `hel`? **Yes.** Chunk boundaries do not preserve line boundaries.

## Exercise F: Async stream processing

```js
for await (const chunk of readable) {
  await processChunk(chunk);
  console.log('processed');
}
console.log('all processed');
```

**Question:** Can `all processed` appear before a prior `processChunk()` resolves? **No**, provided `processChunk` resolves/rejects normally and isn't spawning unawaited work.

## Exercise G: Callback-based Transform

```js
transform(chunk, enc, cb) {
  setTimeout(() => cb(null, chunk), 100);
}
```

**Question:** Does the Transform start the next `_transform` invocation before `cb`? **No**; it waits for the callback.

## Exercise H: Missing callback

```js
transform(chunk, enc, cb) {
  if (chunk.length === 0) return;
  cb(null, chunk);
}
```

**Question:** What is the bug? **The callback is never called for empty chunks**, potentially hanging the stream. Call `cb()` on every successful path.

---

# 18. Practical coding challenges

### Challenge 1 — Sequential file processor (beginner)
- Read a file with `createReadStream({ highWaterMark: 64 * 1024 })`.
- Use `for await...of`, simulate a 500 ms delay per chunk.
- Print chunk number/size and total bytes only when finished.
- Handle read and processing errors.

### Challenge 2 — PDF download endpoint (beginner/intermediate)
- Implement `GET /download` using native `node:http`.
- Set `Content-Type`, `Content-Disposition`, optionally `Content-Length`.
- Stream the file and handle 404, unexpected errors, and client disconnect.

### Challenge 3 — Uppercase + gzip pipeline (intermediate)
- Create `input.txt` with at least ten lines.
- Readable → custom uppercase Transform → `createGzip()` → Writable.
- Save `output.txt.gz`, decompress and verify output.
- **Bonus:** Support UTF-8 characters across chunk boundaries.

### Challenge 4 — Line parser (intermediate)
- Process a large NDJSON or line-delimited text file.
- Preserve partial lines between chunks; decode UTF-8 safely.
- Count valid/invalid records without accumulating all lines in memory.

### Challenge 5 — Writable backpressure (intermediate)
- Create a slow custom Writable (delayed `_write` callback).
- Observe `write()` return values and `drain` events.
- Compare memory usage with and without respecting backpressure.

### Challenge 6 — Async Transform (advanced)
- Transform chunks with simulated async work and correct callback completion.
- Inject a rejection and verify `pipeline()` rejects and cleans up.
- Avoid `async transform()` without a Promise-to-callback bridge.

### Challenge 7 — Object-mode Transform (advanced)
- Read records, convert them into JS objects, validate, and serialize as NDJSON.
- Demonstrate object-mode `highWaterMark` behavior.

### Challenge 8 — Cancellation and robustness (advanced)
- Use `AbortController` with `pipeline()`.
- Cancel halfway through a large copy and verify resource cleanup.
- Test missing file, permission error, and early destination closure.

### Challenge 9 — `_flush()` finalization (advanced)
- Create a line-numbering Transform that buffers partial lines.
- Use `flush()` to emit the final line if the file lacks a trailing newline.

### Challenge 10 — Stream review challenge (senior)
- Given a file-upload pipeline, identify: unbounded buffers, missing size limits, async `data` listeners, unsafe paths, swallowed errors, lack of cancellation, and record-boundary bugs.
- Propose fixes and test cases.

---

# 19. Quick revision sheet

- **Readable:** data source; `data`, `readable`, `end`, `error`, `close`.
- **Writable:** destination; `write`, `end`, `drain`, `finish`, `error`, `close`.
- **Duplex:** two directions. **Transform:** derived output from input.
- **`write(false)`:** accepted chunk; wait for `drain`.
- **`highWaterMark`:** threshold, not exact chunk size/hard cap.
- **Backpressure:** prevent producer from overwhelming consumer.
- **`for await...of`:** simplest sequential async chunk processing.
- **`pipeline()`:** preferred connection + errors + cleanup + completion.
- **`emit()`:** synchronous listener invocation; async listener Promises not awaited.
- **Transform callback:** call once, after async processing, or with an error.
- **Chunk boundaries:** never assume a complete UTF-8 character/line/record.
- **`end` ≠ `finish` ≠ `close`.**
- **`finished()`:** observe stream completion; doesn't consume a readable.
- **`flush()`:** finalize buffered transform output.
- **Object mode:** JS values; buffering measured in objects.
- **HTTP streaming:** set headers, stream body, handle errors and disconnects.
- **Production:** cancellation, limits, validation, cleanup, monitoring.

**Suggested learning next:** Buffers and binary data in depth; then build HTTP APIs, uploads, and PostgreSQL integration.
