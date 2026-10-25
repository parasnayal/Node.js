// import {readFileSync , readFile} from "fs/promises";
import {readFile , writeFile , appendFile , unlink , mkdir , readdir , stat} from "fs/promises";

// Approach A: Synchronous reading

// console.log("1. Start");

// const data = readFileSync("message.txt","utf-8");

// console.log("2. File:", data);

// console.log("3. End");

// Approach B: Callback-based asynchronous reading

// console.log("1. Start");


// readFile("message.txt","utf-8",(err,data)=>{
//     if(err){
//         console.error("Error reading file:", err);
//         return;
//     }

//     console.log("3. File:", data);
// })

// console.log("2. End");

// Approach C: Promise-based asynchronous reading (recommended for our lessons)

// async function main (){
//      console.log("1. Start");

//      const data = await readFile("message.txt","utf-8");

//      console.log("2. File:", data);

//      console.log("3. End");
// }

// main().catch((err)=>{
//     console.error("Error reading file:", err);
// })

// const file = "./notes.txt";

// await writeFile(file , "Hello from Node.js","utf-8");

// await appendFile(file,"This is a new line added to the file.","utf-8");

// const content = await readFile(file,"utf-8");

// console.log("File content:", content);

// await unlink(file);


// await mkdir("./storage", { recursive: true });

// const files = await readdir("./storage");

// console.log(files);

const info = await stat("./message.txt");

console.log("File info:", info);