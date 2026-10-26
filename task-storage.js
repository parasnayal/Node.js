import {readFile , writeFile} from 'fs/promises';

export const getTasks = async () => {
const data = await readFile("./storage/task.json","utf-8");

console.log("Data from task.json:", data);

return JSON.parse(data);
}

export const saveData = async (task) => {
    console.log("Saving data to task.json:", JSON.stringify(task));
await writeFile("./storage/task.json",JSON.stringify(task),"utf-8");
}