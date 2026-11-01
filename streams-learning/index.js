// import {createReadStream , createWriteStream} from 'fs';

// import net from "node:net";

// import { createGzip } from "node:zlib";

// import { pipeline } from "node:stream/promises";

// const filePath = new URL('./data.txt',import.meta.url);

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

// await pipeline(
//     createReadStream("./data.txt"),
//     createGzip(),
//     createWriteStream("./data.txt.gz")
// );

// console.log("File compressed");


// import {createReadStream} from 'fs';

// const filePath = new URL('./data.txt',import.meta.url);

// const stream = createReadStream(filePath,{
//     highWaterMark:64*1024
// })

// stream.on("data",async (chunk)=>{
//     console.log("processing start",chunk.toString());

//     await new Promise((resolve) => {
//     setTimeout(resolve, 2000);
//     });

//     console.log("Processing completed");
// })

// stream.on("end",()=>{
//     console.log("File read ended.")
// })

// BackPressure solutions

// Solution 1: Use pause() and resume()

// import {createReadStream} from 'fs';

// const filePath = new URL('./data.txt',import.meta.url);

// const stream = createReadStream(filePath,{
//     highWaterMark:64*1024
// })

// const processChunk = async (chunk) => {
// await new Promise((resolve)=>{
//     setTimeout(resolve, 1000);
// })

// console.log(chunk.length,'length')
// }

// stream.on("data",(chunk)=>{
//     stream.pause();
// void (async () =>{
//     try {
//         await processChunk(chunk);
//         stream.resume();
//     } catch (error) {
//         stream.destroy(error)
//     }
// })()
// })

// stream.on("end",()=>{
//     console.log("All chunks processed")
// })

// stream.on("error",(error)=>{
//     console.log("stream failed : " , error.message)
// })


// Solution 2: Use for await...of (recommended for sequential processing)

// import {createReadStream} from 'fs';

// const filePath = new URL('./data.txt',import.meta.url);

// const processChunk = async (chunk) => {
// await new Promise((resolve)=>{
//     setTimeout(resolve, 1000);
// })

// console.log(chunk.length,'length')
// }

// const processFile  = async () => {
//     const stream = createReadStream(filePath,{
//     highWaterMark:64*1024
// })
//     try {
//         console.log(stream,'stream')
//        for await (const chunk of stream){
//         console.log(typeof chunk,'chunk')
//         console.log("Processing started");

//         await processChunk(chunk);

//         console.log("Processing completed")
//        }
//        console.log("All chunks processed");
//     } catch (error) {
//         console.error("Processing failed:", error.message);
//     }
// }

// await processFile();


// Solution 3: Use pipeline() for stream-to-stream processing

// Node.js manages backpressure between the readable and writable streams.
// If the writable stream cannot accept data quickly enough, the pipeline coordinates flow rather than continuously pushing unlimited data.

// import {createReadStream, createWriteStream} from 'fs';

// import { pipeline } from 'stream/promises';

// const filePath = new URL('./data.txt',import.meta.url);
// const destPath = new URL('./dest.txt',import.meta.url);

// const copyFile = async () => {
// await pipeline(
//     createReadStream(filePath),
//     createWriteStream(destPath)
// )
// console.log("File copied successfully");
// }

// try {
//     await copyFile();
// } catch (error) {
//     console.error("Copy failed:", error.message);
// }


// Create your first custom Transform Stream
// import {Transform} from 'stream';

// const upperCaseTransform = new Transform({
//     transform(chunk,encoding,callback){
//         const input = chunk.toString();

//         const output = input.toUpperCase();
//         callback(null,output)
//     }
// });

// upperCaseTransform.on("data",(chunk)=>{
//     console.log(chunk.toString());
// })

// upperCaseTransform.write("hello node.js");
// upperCaseTransform.end();

// Use pipeline() with Transform Streams

import {createReadStream , createWriteStream} from 'fs';

import {Transform} from 'stream';

import {pipeline} from 'stream/promises';

const filePath = new URL('./input.txt',import.meta.url);
const destPath = new URL('./output.txt',import.meta.url);

const upperCaseTransform = new Transform({
    transform(chunk , encoding , callback){
        try {
            const result = chunk.toString().toUpperCase();
            callback(null,result);
        } catch (error) {   
            callback(error);
        }
    }
})


const transformFile = async () => {
await pipeline(
createReadStream(filePath),
upperCaseTransform,
createWriteStream(destPath)
)
}

try {
  await transformFile();
} catch (error) {
  console.error("Pipeline failed:", error.message);
}