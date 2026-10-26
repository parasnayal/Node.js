import {createReadStream , createWriteStream} from 'fs';

import net from "node:net";

import { createGzip } from "node:zlib";

import { pipeline } from "node:stream/promises";

const filePath = new URL('./data.txt',import.meta.url);

// const stream = createReadStream(filePath,{
//     highWaterMark:8
// });

// stream.on("data",(chunk)=>{
//     console.log(chunk)
// });

// stream.on("end",()=>{
//      console.log("Finished reading file");
// })

// stream.on("error",(error)=>{
//     console.error("Read failed:", error.message);
// })

// const stream  = createWriteStream(filePath);

// stream.write("Hello\n");

// stream.write("Learning Node.js Streams\n");

// stream.end();


// const server = net.createServer((socket)=>{
//     socket.on("data",(chunk)=>{
//         console.log("dsddsdsdsdsdsd" , chunk.toString());
//         socket.write("Message received");
//     })
// })

// server.listen(4000)

await pipeline(
    createReadStream("./data.txt"),
    createGzip(),
    createWriteStream("./data.txt.gz")
);

console.log("File compressed");