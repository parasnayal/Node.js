import {readFile} from 'fs/promises';

// const data = await readFile(
//   "./storage/task.json",
//   "utf-8"
// );

// console.log(data,'daaatattatat')

const TASK_FILE = new URL(
  "../storage/task.json",
  import.meta.url
);

console.log(import.meta.url,'url')


console.log(TASK_FILE,'TASK_FILE');

const data = await readFile(
    TASK_FILE,
    "utf-8"
);

console.log(data,'datattatat')