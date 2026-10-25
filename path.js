import path from "path";

import {fileURLToPath} from "url";

const filePath = path.join("./storage","./task.json");

console.log("File path:", filePath);


const baseName = path.basename("../storage/task.json");

console.log("Base name:", baseName);

const dirName = path.dirname("../storage/task.json");

console.log("Directory name:", dirName);

const extName = path.extname("../storage/task.json");

console.log("Extension name:", extName);

const isPathAbsolute = path.isAbsolute("../storage/task.json");

console.log("Is path absolute:", isPathAbsolute);

const normalizedPath = path.normalize("../storage/../storage/task.json");

console.log("Normalized path:", normalizedPath);

console.log(path.join("storage", "tasks.json"));

console.log(path.resolve("storage", "tasks.json"));

console.log(import.meta.url,'url')

const __filename = fileURLToPath(import.meta.url);

