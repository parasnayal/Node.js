# Node.js Buffers & Binary Data — Complete Notes and Interview Guide

> Practical ESM reference for Node.js backend engineering. Includes concepts, runnable examples, pitfalls, interview Q&A, output predictions, and exercises.

## Contents
1. Mental model
2. Bits, bytes, hex and encodings
3. Creating Buffers safely
4. Strings, UTF-8 and decoding
5. Buffer APIs and shared memory
6. Integers, endianness and binary protocols
7. Buffers and streams
8. TCP sockets and framing
9. HTTP request bodies
10. File uploads and Multer
11. Memory, performance and security
12. Debugging checklist
13. Interview questions with answers
14. Predict-the-output questions
15. Hands-on exercises
16. Quick revision sheet

---

## 1. Mental model

A **Buffer** is a fixed-length sequence of bytes. Node's `Buffer` class extends JavaScript's `Uint8Array`. A Buffer is not inherently text, JSON, an image or a PDF: its meaning depends on the encoding or binary format used to interpret its bytes.

- **String**: a sequence of UTF-16 code units in JavaScript.
- **Buffer**: mutable bytes (values 0–255), fixed length.
- **Readable stream**: delivers bytes incrementally, often as Buffers.
- **Writable stream**: accepts bytes incrementally.
- **EventEmitter**: synchronously invokes listeners when an event is emitted; it is not an I/O queue.

```js
import { Buffer } from 'node:buffer';
const data = Buffer.from('ABC', 'utf8');
console.log(data);             // <Buffer 41 42 43> (hex)
console.log(data[0]);          // 65 (decimal)
console.log(data.toString());  // ABC
console.log(Buffer.isBuffer(data)); // true
```

## 2. Bits, bytes, hexadecimal and encodings

- 1 byte = 8 bits; an unsigned byte ranges from 0 to 255.
- Hexadecimal has 16 digits (`0`–`9`, `a`–`f`); two hex digits represent one byte.
- `A` = decimal 65 = hexadecimal `0x41` = binary `01000001`.
- UTF-8 is a variable-width text encoding; a Unicode code point may occupy 1–4 bytes.
- JavaScript `.length` counts UTF-16 **code units**, not UTF-8 bytes or necessarily user-perceived characters.

```js
console.log('Hello'.length);                    // 5
console.log(Buffer.byteLength('Hello', 'utf8')); // 5
console.log('😊'.length);                       // 2
console.log(Buffer.byteLength('😊', 'utf8'));    // 4
console.log(Buffer.from('नमस्ते').length);       // 18
```

**Interview trap:** For HTTP `Content-Length`, use the byte length of the actual encoded body, not `string.length`.

## 3. Creating Buffers safely

```js
import { Buffer } from 'node:buffer';

const fromText = Buffer.from('Node.js', 'utf8');
const fromArray = Buffer.from([65, 66, 67]);
const zeros = Buffer.alloc(4);           // <Buffer 00 00 00 00>
const filled = Buffer.alloc(4, 0xff);    // <Buffer ff ff ff ff>
const fast = Buffer.allocUnsafe(4);      // bytes may be uninitialized

console.log(fromArray.toString());       // ABC
```

- `Buffer.from(string, encoding)` encodes text.
- `Buffer.from(array)` converts numeric elements to bytes.
- `Buffer.alloc(n)` zero-initializes by default.
- `Buffer.allocUnsafe(n)` may contain old memory contents. **Fully overwrite before reading or sending it.** It is not automatically unsafe if correctly initialized, but it is easy to misuse.
- `Buffer.allocUnsafeSlow(n)` exists for specialized allocation cases; not necessary for most backend work.
- Buffers cannot be resized; create a new Buffer when you need a different length.

## 4. Strings, UTF-8 and decoding

```js
const b = Buffer.from('Hello 😊', 'utf8');
console.log(b.toString('utf8'));   // Hello 😊
console.log(b.toString('hex'));    // hex bytes
console.log(b.toString('base64')); // base64 representation
const restored = Buffer.from(b.toString('base64'), 'base64');
console.log(restored.equals(b));   // true
```

**Encoding is not encryption.** Hex and Base64 represent the same bytes in text form; anyone can decode them.

### Split multibyte characters

If a UTF-8 character spans two chunks, calling `.toString('utf8')` on each chunk separately can produce replacement characters. Use a streaming decoder when chunk boundaries are arbitrary:

```js
import { StringDecoder } from 'node:string_decoder';
const decoder = new StringDecoder('utf8');
const emoji = Buffer.from('😊');
console.log(decoder.write(emoji.subarray(0, 2))); // ''
console.log(decoder.write(emoji.subarray(2)));    // 😊
console.log(decoder.end());                       // ''
```

For a readable stream of text, `readable.setEncoding('utf8')` can also handle multibyte decoding across chunks.

## 5. Buffer methods, copies and shared memory

```js
const original = Buffer.from([10, 20, 30, 40]);
const view = original.subarray(1, 3); // shares memory
view[0] = 99;
console.log(original); // <Buffer 0a 63 1e 28>

const copy = Buffer.from(original);  // independent copy
copy[0] = 7;
console.log(original[0]); // 10

const joined = Buffer.concat([Buffer.from('Hi '), Buffer.from('Node')]);
console.log(joined.toString()); // Hi Node
console.log(joined.equals(Buffer.from('Hi Node'))); // true
```

Useful APIs:

| API | What it does | Caution |
|---|---|---|
| `Buffer.isBuffer(x)` | Detects Buffer | A plain `Uint8Array` is not necessarily Buffer |
| `Buffer.byteLength(s, enc)` | Encoded byte count | Not the same as JS string length |
| `buffer.toString(enc)` | Decode bytes | Arbitrary binary may not be valid UTF-8 |
| `buffer.subarray(a,b)` | View into same memory | Mutations affect original |
| `buffer.copy(target)` | Copy bytes | Destination must have enough room |
| `Buffer.from(buffer)` | New Buffer copy | Allocates memory |
| `Buffer.concat(list)` | Join chunks | Allocates a combined Buffer |
| `buffer.equals(other)` | Byte-for-byte equality | Not constant-time for secrets |
| `buffer.fill(value)` | Overwrite bytes | Useful for initialization |
| `buffer.readUInt16BE()` | Read binary integer | Must respect byte order and bounds |

**Important:** `Buffer.prototype.slice()` also returns a view (unlike `TypedArray.prototype.slice()`, which copies). Prefer `subarray()` when you mean to share memory; use `Buffer.from(view)` for a copy.

## 6. Binary integers and endianness

For multibyte integers, byte order matters:

- Big-endian: most significant byte first.
- Little-endian: least significant byte first.

```js
const b = Buffer.alloc(4);
b.writeUInt16BE(0x1234, 0); // bytes 12 34
b.writeUInt16LE(0x1234, 2); // bytes 34 12
console.log(b);             // <Buffer 12 34 34 12>
console.log(b.readUInt16BE(0)); // 4660
console.log(b.readUInt16LE(2)); // 4660
```

Other methods: `readUInt32BE/LE`, `writeUInt32BE/LE`, signed variants such as `readInt16BE`, floating point `readFloatBE`, `readDoubleLE`, and `readBigUInt64BE` for large integers. Check offset bounds and protocol specifications.

### Length-prefixed message framing

TCP is a byte stream, not a message stream. One `socket.write()` can arrive in multiple `data` events; multiple writes can be combined. A common protocol uses a four-byte length header followed by the payload:

```js
const payload = Buffer.from(JSON.stringify({ type: 'ping' }), 'utf8');
const frame = Buffer.alloc(4 + payload.length);
frame.writeUInt32BE(payload.length, 0);
payload.copy(frame, 4);
// Send frame over TCP; receiver must buffer until header + payload are complete.
```

Never trust an unbounded length supplied by a client; validate it against an application limit.

## 7. Buffers and Node.js streams

```js
import { createReadStream } from 'node:fs';
const stream = createReadStream('./example.pdf', { highWaterMark: 64 * 1024 });
let total = 0;
stream.on('data', chunk => {
  console.log(Buffer.isBuffer(chunk)); // true by default
  total += chunk.length;
});
stream.on('end', () => console.log('Total bytes:', total));
stream.on('error', console.error);
```

`highWaterMark` is a buffering threshold, **not** a guaranteed chunk size or a strict maximum total memory use. A readable file stream usually emits Buffer chunks unless an encoding is configured.

For sequential async processing:

```js
for await (const chunk of createReadStream('./example.pdf')) {
  await processChunk(chunk); // define processChunk in your application
}
```

For transferring files, `pipeline()` provides backpressure and propagates errors:

```js
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
await pipeline(createReadStream('./source.pdf'), createWriteStream('./copy.pdf'));
```

### Backpressure refresher

- `writable.write(chunk)` returns `false` when the producer should pause; **the chunk was accepted**.
- Wait for `drain` before writing more.
- `pipeline()` manages flow control for connected streams.
- An `async` EventEmitter `data` listener is **not awaited** by `emit()`; it does not automatically provide backpressure.
- `end` means the readable stream has no more data, not that arbitrary async tasks started in `data` listeners have completed.

## 8. Buffers and TCP sockets

```js
import net from 'node:net';
const server = net.createServer(socket => {
  socket.on('data', chunk => {
    console.log('bytes:', chunk.length);
    socket.write(Buffer.from('ACK'));
  });
  socket.on('error', console.error);
});
server.listen(4000);
```

`net.Socket` is a Duplex stream. TCP preserves byte order but not application message boundaries. Design a framing strategy: delimiter-based, fixed-size messages, length prefix, or a proper higher-level protocol. Decode text incrementally if UTF-8 characters might be split.

## 9. HTTP request bodies and JSON

`http.IncomingMessage` is a readable stream. A request body may arrive in multiple Buffer chunks. For a small JSON body, enforce a limit, combine, decode, parse, and validate:

```js
import http from 'node:http';

const MAX_BYTES = 1024 * 1024;

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/tasks') {
    res.writeHead(404).end();
    return;
  }

  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    res.writeHead(415).end('Expected application/json');
    return;
  }

  let total = 0;
  const chunks = [];
  try {
    for await (const chunk of req) {
      total += chunk.length;
      if (total > MAX_BYTES) {
        res.writeHead(413).end('Body too large');
        return;
      }
      chunks.push(chunk);
    }

    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      res.writeHead(400).end('Invalid JSON');
      return;
    }

    if (typeof body?.title !== 'string' || !body.title.trim()) {
      res.writeHead(400).end('Title is required');
      return;
    }

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 1, title: body.title.trim() }));
  } catch (error) {
    console.error('Request stream error:', error);
    if (!res.headersSent && !res.destroyed) res.writeHead(500).end('Request failed');
  }
});

server.listen(3000);
```

**Production note:** This is a teaching example. A hardened server should account for aborted connections, incomplete requests, content-length inconsistencies, timeouts, JSON depth/shape limits, and cleanup. For large bodies, avoid `Buffer.concat()` and use streaming parsers or streaming file destinations. Avoid parsing each incoming chunk independently as JSON.

## 10. File uploads, multipart and Multer

Browser uploads often use `FormData` with `multipart/form-data`:

```js
const form = new FormData();
form.append('file', selectedFile);
await fetch('/upload', { method: 'POST', body: form });
// Let the browser set Content-Type and multipart boundary.
```

Multipart bodies contain field headers, boundaries and file bytes. You **cannot** simply write the entire multipart HTTP request body to a PDF and expect a valid PDF; a multipart parser must extract the file part.

- Multer commonly uses a multipart parser such as Busboy underneath.
- **Memory storage:** accumulated file available as a Buffer; convenient for small files but risky for large uploads.
- **Disk storage:** file bytes are written to disk.
- For large files, stream to disk/object storage and enforce file size, type and authorization checks.

### Raw binary upload with `pipeline()` (not multipart)

```js
import http from 'node:http';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/upload') {
    res.writeHead(404).end();
    return;
  }
  try {
    await pipeline(req, createWriteStream('./uploaded-file.bin'));
    res.writeHead(201).end('Uploaded');
  } catch (error) {
    console.error(error);
    if (!res.headersSent && !res.destroyed) res.writeHead(500).end('Upload failed');
  }
});
server.listen(3000);
```

Test: `curl -X POST -H 'Content-Type: application/octet-stream' --data-binary @example.pdf http://localhost:3000/upload`

**Security:** This is not production ready. Add authentication, limits, safe unique paths, file signature checks, cleanup for partial files, malware scanning where appropriate, and appropriate response handling for client disconnects.

## 11. Memory, performance and security

1. Avoid accumulating arbitrarily large input in `chunks[]`; cap it or stream to storage.
2. `Buffer.concat()` creates a new Buffer and copies bytes. It is suitable for bounded payloads, not huge uploads.
3. `subarray()` shares backing memory; retaining a tiny view can keep a much larger backing allocation alive.
4. `Buffer.allocUnsafe()` must be fully initialized before use.
5. Don't treat Base64 as encryption or a secure secret store.
6. Don't decode arbitrary PDF/image/ZIP bytes as UTF-8 for processing.
7. Check offsets, lengths and signedness when parsing binary protocols.
8. Be aware that Buffers use memory tracked outside the usual V8 JavaScript object heap (`external`/`arrayBuffers` in memory metrics); memory pressure still matters.
9. Validate sizes **before** allocating memory from untrusted lengths.
10. For secret comparisons, consider `crypto.timingSafeEqual()` with appropriately validated equal-length Buffers; plain `equals()` is not intended for timing-safe secret verification.

## 12. Debugging checklist

- Is the value actually a Buffer? `Buffer.isBuffer(value)`.
- Are you logging hex, decimal bytes, or decoded text? These are different representations.
- Is encoding consistent between sender and receiver?
- Is the data complete, or only one chunk?
- Could a UTF-8 character or protocol message span chunks?
- Are you accidentally modifying shared memory through `subarray()` or `slice()`?
- Is your body/file size bounded?
- Are you using a streaming parser for large or multipart data?
- Is the stream error handled? Is incomplete output cleaned up?
- Are you incorrectly assuming `await` in an EventEmitter listener pauses a stream?

---

# 13. Interview questions and answers

## Beginner

**Q1. What is a Buffer?**  
A fixed-length, mutable byte sequence used for binary data in Node.js.

**Q2. How is Buffer related to Uint8Array?**  
`Buffer` extends `Uint8Array` and adds Node-specific encoding and binary APIs.

**Q3. Why are Buffers useful in backend development?**  
They represent file contents, socket payloads, HTTP bodies, binary protocols and stream chunks.

**Q4. What is the difference between a Buffer and a string?**  
A Buffer holds raw bytes; a JS string holds UTF-16 code units and is immutable.

**Q5. What is a byte?**  
Eight bits, usually interpreted as an integer from 0 to 255.

**Q6. Why does Node print `<Buffer 41 42 43>` for `ABC`?**  
Buffer inspection displays hexadecimal byte values; `A` is decimal 65 or hex `41`.

**Q7. What is `Buffer.from()`?**  
A way to create a Buffer from strings, arrays, array buffers or other supported data.

**Q8. `Buffer.alloc()` vs `Buffer.allocUnsafe()`?**  
`alloc()` initializes bytes; `allocUnsafe()` may return uninitialized bytes and requires complete overwrite before exposure.

**Q9. Is Buffer resizable?**  
No, its length is fixed.

**Q10. What does `Buffer.isBuffer()` do?**  
Checks whether a value is a Node Buffer.

**Q11. What does `.toString('utf8')` do?**  
Decodes bytes as UTF-8 text; invalid sequences may be replaced.

**Q12. Is Base64 encryption?**  
No, it is a reversible binary-to-text encoding.

## Intermediate

**Q13. Why can `str.length` differ from `Buffer.byteLength(str)`?**  
String length counts UTF-16 code units; byte length counts encoded bytes.

**Q14. How many UTF-8 bytes does `😊` use?**  
Four, while JS string length is two.

**Q15. What does `Buffer.concat()` do?**  
Allocates a combined Buffer and copies the supplied bytes into it.

**Q16. Does `subarray()` copy data?**  
No; it creates a view sharing underlying memory.

**Q17. Does Buffer `.slice()` copy?**  
No, Node Buffer `.slice()` returns a shared-memory view; use `Buffer.from(...)` to copy.

**Q18. How can you create an independent copy of a Buffer?**  
`Buffer.from(existingBuffer)`.

**Q19. What is endianness?**  
The order in which bytes of a multibyte number are stored or transmitted.

**Q20. Difference between `readUInt16BE` and `readUInt16LE`?**  
They interpret the same two bytes in big-endian versus little-endian order.

**Q21. Why are Buffer chunks common in streams?**  
Streams incrementally deliver binary data instead of loading all bytes into memory.

**Q22. Does `highWaterMark` guarantee every chunk has that size?**  
No; it is a buffering threshold, not a guaranteed chunk length.

**Q23. Why can decoding each chunk separately corrupt UTF-8 text?**  
A multibyte character can be split between chunks.

**Q24. How do you decode UTF-8 correctly across chunk boundaries?**  
Use `StringDecoder` or a readable stream with UTF-8 encoding configured.

**Q25. Why shouldn't you convert a PDF Buffer to UTF-8 text?**  
PDFs contain binary structures; UTF-8 decoding is not PDF text extraction and can corrupt bytes on re-encoding.

## Backend and networking

**Q26. Is one TCP `socket.write()` equal to one `data` event?**  
No; TCP is an ordered byte stream with no application message boundaries.

**Q27. What is message framing?**  
A protocol convention (length prefix, delimiter, fixed length, etc.) for identifying complete messages in a byte stream.

**Q28. Why shouldn't you `JSON.parse()` each HTTP chunk?**  
A chunk may contain only part of the JSON document.

**Q29. How do you parse a small JSON HTTP request safely?**  
Enforce a size limit, collect bytes, combine, decode, parse with error handling, and validate the resulting data.

**Q30. Why is `Buffer.concat(chunks)` unsuitable for unbounded uploads?**  
It requires memory for all accumulated chunks and an additional combined allocation.

**Q31. What is the Node HTTP request object?**  
An `http.IncomingMessage`, which is a readable stream.

**Q32. How does `multipart/form-data` differ from raw binary?**  
Multipart includes boundaries and per-part metadata; a parser must extract file parts. Raw binary is just the body bytes.

**Q33. How does Multer use Buffers and streams?**  
It parses multipart data incrementally; memory storage accumulates a file as Buffer, while disk storage writes it to disk.

**Q34. Why prefer streaming for large uploads?**  
It reduces peak application memory and supports flow control.

**Q35. What does `writable.write()` returning `false` mean?**  
The chunk was accepted, but the producer should pause until `drain`.

**Q36. Does an async `data` listener automatically pause a stream?**  
No; EventEmitter doesn't await listener Promises.

**Q37. What does `pipeline()` provide?**  
Stream connection, backpressure coordination, error propagation and cleanup.

**Q38. Does a stream's `end` event guarantee all async work launched by `data` listeners is finished?**  
No; it signals the readable side is finished producing data.

## Senior-level scenarios

**Q39. What security problem can arise from `allocUnsafe()`?**  
Exposing bytes before initialization may leak data left in reused memory.

**Q40. What risk arises from retaining a tiny `subarray()` of a huge Buffer?**  
The shared backing memory can remain alive as long as the view is referenced.

**Q41. Why validate a length-prefixed TCP frame's declared length?**  
A malicious peer can claim an enormous length, causing excessive allocation or denial of service.

**Q42. What happens if you treat `Buffer.equals()` as a secret-comparison primitive?**  
It is not guaranteed constant-time; use an appropriate timing-safe comparison API.

**Q43. Why can a Node process consume significant memory even when V8 heap usage seems moderate?**  
Buffers and other native allocations contribute to external/array-buffer memory outside the ordinary JS heap accounting.

**Q44. How do you handle partial uploads safely?**  
Use bounded streaming, detect failures/disconnects, and remove incomplete temporary files.

**Q45. How would you process a multi-GB CSV?**  
Stream bytes through a decoder and record-aware parser; process rows incrementally with backpressure rather than loading all data.

**Q46. What is the difference between a Buffer and an ArrayBuffer?**  
An `ArrayBuffer` represents raw backing memory; Buffer is a byte-oriented view with Node-specific methods.

**Q47. How do you avoid copying a Buffer unnecessarily?**  
Use views (`subarray`) when safe, but understand aliasing and backing-memory retention.

**Q48. How do you avoid text corruption when writing a transform?**  
Use a streaming decoder and maintain parser state across chunks; don't assume a chunk ends on a character or record boundary.

**Q49. How should you validate uploaded file type?**  
Do not trust filename or `Content-Type` alone; inspect signatures/structure, enforce allowed formats, and consider scanning.

**Q50. What is the difference between concurrency and parallelism when processing Buffer chunks?**  
Concurrency overlaps operations; parallelism executes work simultaneously. Async listeners can overlap pending I/O but don't automatically run CPU-heavy JS in parallel.

---

# 14. Predict-the-output questions

Try each before reading the answer.

### P1
```js
const b = Buffer.from('ABC');
console.log(b[0], b.toString('hex'));
```
**Answer:** `65 414243`. The index yields decimal 65; hex encoding yields `414243`.

### P2
```js
console.log('😊'.length);
console.log(Buffer.byteLength('😊', 'utf8'));
```
**Answer:** `2` then `4`. UTF-16 code units vs UTF-8 bytes.

### P3
```js
const b = Buffer.alloc(3);
b[0] = 256;
b[1] = 257;
console.log(b);
```
**Answer:** `<Buffer 00 01 00>`. Indexed byte assignments are stored modulo 256 for these positive integers.

### P4
```js
const a = Buffer.from([1, 2, 3]);
const b = a.subarray(0, 2);
b[0] = 9;
console.log(a[0], b[0]);
```
**Answer:** `9 9`. The view shares memory.

### P5
```js
const a = Buffer.from([1, 2]);
const b = Buffer.from(a);
b[0] = 8;
console.log(a[0], b[0]);
```
**Answer:** `1 8`. `Buffer.from(a)` copies bytes.

### P6
```js
const a = Buffer.from('Hi ');
const b = Buffer.from('Node');
console.log(Buffer.concat([a,b]).toString());
```
**Answer:** `Hi Node`.

### P7
```js
const b = Buffer.alloc(2);
b.writeUInt16BE(0x1234);
console.log(b.toString('hex'), b.readUInt16LE());
```
**Answer:** `1234 13330`. The bytes `12 34` interpreted little-endian are `0x3412` = 13330.

### P8
```js
const a = Buffer.from('secret');
const b = Buffer.from('secret');
console.log(a === b, a.equals(b));
```
**Answer:** `false true`. Different objects, identical bytes.

### P9
```js
const b = Buffer.from('hello');
const part = b.slice(0, 2);
part[0] = 0x48;
console.log(b.toString());
```
**Answer:** `Hello`. Buffer `.slice()` shares memory.

### P10
```js
const b = Buffer.from('ABC');
console.log(b.toString('base64'));
```
**Answer:** `QUJD`.

### P11 — Reasoning
A TCP sender calls `socket.write(Buffer.from('HELLO'))` once. Can the receiver receive `HE` then `LLO` in separate `data` events?

**Answer:** Yes. TCP preserves order, not write-call boundaries.

### P12 — Reasoning
A stream emits `data`, and its listener starts an async operation with `await`. Does `end` necessarily wait for that operation?

**Answer:** No. The stream does not await async EventEmitter listeners.

---

# 15. Hands-on exercises

### E1 — Basic Buffer operations
Create `Buffer.from('Learning Node.js')`; print hex, byte length, UTF-8 text and `Buffer.isBuffer()`.

### E2 — Safe allocation
Allocate five zero bytes, change first byte to decimal 100, inspect hex output.

### E3 — Shared view vs copy
Use `subarray()` and `Buffer.from()`; mutate each and explain why only one changes the original.

### E4 — Unicode investigation
Compare JS `.length` and `Buffer.byteLength()` for `Hello`, `नमस्ते`, and `😊`.

### E5 — Endianness
Write `0x1234` as BE and LE into a four-byte Buffer; read both back.

### E6 — Chunk-safe decoding
Split the four UTF-8 bytes of `😊` into two Buffers; decode correctly with `StringDecoder`.

### E7 — File chunk counter
Use `createReadStream()` to count total bytes without loading the whole file. Handle `error`.

### E8 — Bounded JSON API
Build `POST /tasks` with a 1 MiB body limit, valid JSON handling, title validation and `201`/`400`/`413` responses. Emit `taskCreated` only after persistence.

### E9 — Binary upload
Accept a raw `application/octet-stream` upload using `pipeline()`; add size limits, temporary filenames and cleanup.

### E10 — Length-prefixed TCP messages
Write a server that accumulates incoming Buffers, parses a 4-byte BE length header, rejects oversized frames and handles multiple messages in one chunk.

### E11 — Streaming transform
Build an uppercase Transform stream; use `StringDecoder` or another chunk-safe approach for UTF-8; connect with `pipeline()`.

### E12 — Interview system design
Design a safe upload service for 500 MB files: authentication, validation, streaming to object storage, checksums, retries, progress, cleanup and observability. Explain where Buffers exist and why whole-file buffering is undesirable.

---

# 16. Quick revision sheet

```js
import { Buffer } from 'node:buffer';

Buffer.from('ABC');                   // create from text
Buffer.from([65, 66, 67]);           // create from bytes
Buffer.alloc(8);                     // zero-filled
Buffer.allocUnsafe(8);               // initialize before use
Buffer.byteLength('😊', 'utf8');      // 4
Buffer.isBuffer(Buffer.from('x'));   // true
Buffer.from('ABC').toString('hex');   // 414243
Buffer.from('ABC').toString('base64');// QUJD
Buffer.concat([Buffer.from('A'), Buffer.from('B')]).toString(); // AB

const b = Buffer.from([1,2,3]);
const view = b.subarray(0,2);         // shared memory
const copy = Buffer.from(b);         // independent memory
```

**Ten takeaways:**
1. Buffer = fixed-size raw bytes.
2. Node displays Buffer bytes in hex.
3. `Buffer` extends `Uint8Array`.
4. UTF-8 byte length differs from JS string length.
5. `alloc()` initializes; `allocUnsafe()` needs careful overwrite.
6. `subarray()` and Buffer `slice()` share memory.
7. TCP and stream chunks are not message/record boundaries.
8. Decode UTF-8 safely across chunks.
9. Limit untrusted body and frame sizes; stream large files.
10. Backpressure and async listener completion are different concerns.

**Suggested next learning step:** Native Node.js HTTP API hardening, then Express middleware and PostgreSQL integration.
