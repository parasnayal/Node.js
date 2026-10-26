import http from "http";

import {getTasks , saveData} from './task-storage.js';

const PORT = 3000;

// const server = http.createServer((req,res)=>{
//     console.log("Method:", req.method);
//   console.log("URL:", req.url);
//   console.log("Headers:", req.headers);

//     res.writeHead(200,{"content-type":"text/plain; charset=utf-8"});

//     res.end("Hello From Node.js Server");
// })

// const server = http.createServer((req,res)=>{
//     console.log("Method:", req.method);
//   console.log("URL:", req.url);
//   console.log("Headers:", req.headers);

//     res.writeHead(200,{"content-type":"application/json"});

//     res.end(JSON.stringify({
//         message:"Request received successfully",
//     }));
// })

// const users = [
//   { id: 1, name: "Rahul" },
//   { id: 2, name: "Priya" },
// ];

// const server = http.createServer((req,res)=>{
//     const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

//     res.setHeader("Content-Type", "application/json");

//     if(req.method === "GET" && url.pathname === "/health"){
//         res.writeHead(200);
//         res.end(JSON.stringify({ status: "OK" }));
//         return;
//     }

//         if(req.method === "GET" && url.pathname === "/users"){
//         res.writeHead(200);
//         res.end(JSON.stringify({ status: "OK" , data: users }));
//         return;
//     }

//     res.writeHead(404);
//     res.end(JSON.stringify({ error: "Route not found" }));

// })

function validateTaskId(rawId) {
  if (!/^[1-9]\d*$/.test(rawId)) {
    return null;
  }

  const id = Number(rawId);

  if (!Number.isSafeInteger(id)) {
    return null;
  }

  return id;
}

const TASKS = [
  {
    id: 1,
    title: "Learn Node.js",
    completed: false,
  },
  {
    id: 2,
    title: "Build HTTP server",
    completed: false,
  },
];

const getTaskId =  (tasks) => {
    let nextTaskId = Math.max(0, ...tasks.map(task => task.id)) + 1;

    console.log(nextTaskId,'next')

    return nextTaskId;
}

// const server = http.createServer((req,res)=>{
//     const url = new URL (req.url, `http://${req.headers.host || "localhost"}`);

//     if(req.method === "GET" && url.pathname === "/health"){
//         res.writeHead(200,{"content-type":"application/json"});

//         return res.end(JSON.stringify({status:"OK"}));
//     }

//     const taskRoute = url.pathname.match(/^\/tasks\/([^/]+)$/);

//     if(req.method === "GET" && url.pathname === "/tasks"){
//         res.writeHead(200,{"content-type":"application/json"});

//        return res.end(JSON.stringify({status:"OK",data:TASKS}));
//     }

//     if(req.method === "GET" && taskRoute ){
//         const taskId = taskRoute[1];

//         if (!validateTaskId(taskId)) {
//          res.writeHead(400,{"content-type":"application/json"});

//         return res.end(JSON.stringify({status:"ERROR",message:"Invalid task ID"}));
//         }

//         const taskById = TASKS.find(taskItem => taskItem.id === parseInt(taskId));

//         if(!taskById) {
//             res.writeHead(404,{"content-type":"application/json"});

//             return res.end(JSON.stringify({status:"ERROR",message:"Task not found"}))
//         }

//         res.writeHead(200,{"content-type":"application/json"});

//         return res.end(JSON.stringify({status:"OK",data:taskById}));
//     }

//         if(req.method === "DELETE" && taskRoute ){
//         const taskId = taskRoute[1];
        
//         if (!validateTaskId(taskId)) {
//          res.writeHead(400,{"content-type":"application/json"});

//         return res.end(JSON.stringify({status:"ERROR",message:"Invalid task ID"}))
//         }

//         const deletedTask = TASKS.findIndex(taskItem => taskItem.id === parseInt(taskId));

//         if(deletedTask === -1){
//             res.writeHead(404,{"content-type":"application/json"});

//             return res.end(JSON.stringify({status:"ERROR",message:"Task not found"}))
//         }

//         TASKS.splice(deletedTask,1);

//         res.writeHead(204);

//         res.end();
//     }

//     if(req.method === "POST" && url.pathname === "/tasks"){
//         let body = "";

//         req.on("data",(chunk)=>{
//             body += chunk.toString();
            
//         })

//         req.on("end",()=>{
//            try{
//             const payload = JSON.parse(body);

//             if (
//             !payload ||
//             typeof payload !== "object" ||
//             Array.isArray(payload) ||
//             typeof payload.title !== "string" ||
//             !payload.title.trim()
//             ) {
//             res.writeHead(400, { 'Content-Type': 'application/json' });
//             return res.end(JSON.stringify({ error: 'Invalid JSON payload format.' }));
//             }

//             const newTask = {
//                 id: nextTaskId++,
//                 title: payload.title.trim(),
//                 completed: false,
//             }

//             TASKS.push(newTask);
            
//             res.writeHead(201,{"content-type":"application/json"});

//             return res.end(JSON.stringify({status:"OK",data:newTask}));
//            }catch(err){
//             res.writeHead(400, { 'Content-Type': 'application/json' });
//             return res.end(JSON.stringify({ error: 'Invalid JSON payload format.' }));
//            }
//         })   

//         return;
//     }

//     res.writeHead(404,{"content-type":"application/json"});
//     res.end(JSON.stringify({status: "ERROR", error: "Route not found" }));

// })


const server = http.createServer(async (req,res)=>{
    const url = new URL (req.url, `http://${req.headers.host || "localhost"}`);

    if(req.method === "GET" && url.pathname === "/health"){
        res.writeHead(200,{"content-type":"application/json"});

        return res.end(JSON.stringify({status:"OK"}));
    }

    const taskRoute = url.pathname.match(/^\/tasks\/([^/]+)$/);

    if(req.method === "GET" && url.pathname === "/tasks"){
       
        
        try {
            const data = await getTasks()

        res.writeHead(200,{"content-type":"application/json"});
        
        return res.end(JSON.stringify({status:"OK",data:data}));
        } catch (error) {
             res.writeHead(500, {
                "Content-Type": "application/json",
            });

            return res.end(JSON.stringify({
            status: "ERROR",
            message: "Unable to retrieve tasks",
            }));
        }
       
    }

    if(req.method === "GET" && taskRoute ){
        const taskId = taskRoute[1];

        if (!validateTaskId(taskId)) {
         res.writeHead(400,{"content-type":"application/json"});

        return res.end(JSON.stringify({status:"ERROR",message:"Invalid task ID"}));
        }

        try {
            const taskList = await getTasks();

        const taskById = taskList.find(taskItem => taskItem.id === parseInt(taskId));

        if(!taskById) {
            res.writeHead(404,{"content-type":"application/json"});

            return res.end(JSON.stringify({status:"ERROR",message:"Task not found"}))
        }

        res.writeHead(200,{"content-type":"application/json"});

        return res.end(JSON.stringify({status:"OK",data:taskById}));
        } catch (error) {
            res.writeHead(500, {
                "Content-Type": "application/json",
            });

            return res.end(JSON.stringify({
            status: "ERROR",
            message: "Unable to retrieve tasks",
            }));
        }

        
    }

        if(req.method === "DELETE" && taskRoute ){
        const taskId = taskRoute[1];
        
        if (!validateTaskId(taskId)) {
         res.writeHead(400,{"content-type":"application/json"});

        return res.end(JSON.stringify({status:"ERROR",message:"Invalid task ID"}))
        }

        try {
            const taskList = await getTasks();

        const deletedTask = taskList.findIndex(taskItem => taskItem.id === parseInt(taskId));

        if(deletedTask === -1){
            res.writeHead(404,{"content-type":"application/json"});

            return res.end(JSON.stringify({status:"ERROR",message:"Task not found"}))
        }

        taskList.splice(deletedTask,1);

        await saveData(taskList);

        res.writeHead(204);

        return res.end();
        } catch (error) {
            res.writeHead(500, {
                "Content-Type": "application/json",
                });

            return res.end(JSON.stringify({
            status: "ERROR",
            message: "Unable to retrieve tasks",
            }));
        }

        
    }

    if(req.method === "POST" && url.pathname === "/tasks"){
        let body = "";

        req.on("data",(chunk)=>{
            body += chunk.toString();
            
        })


        req.on("end",async ()=>{
           try{
            const payload = JSON.parse(body);

            console.log(payload,'payload')

            if (
            !payload ||
            typeof payload !== "object" ||
            Array.isArray(payload) ||
            typeof payload.title !== "string" ||
            !payload.title.trim()
            ) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid JSON payload format.' }));
            }

            try {
                const existingTask = await getTasks();
           
            const taskId = getTaskId(existingTask);

            const newTask = {
                id: taskId,
                title: payload.title.trim(),
                completed: false,
            }
            
            await saveData([...existingTask , newTask]);
            
            res.writeHead(201,{"content-type":"application/json"});

            return res.end(JSON.stringify({status:"OK",data:newTask}));
            } catch (error) {
                res.writeHead(500, {
                "Content-Type": "application/json",
                });

            return res.end(JSON.stringify({
            status: "ERROR",
            message: "Unable to retrieve tasks",
            }));
            }
           }catch(err){
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid JSON payload format.' }));
           }
        })   

        return;
    }

    res.writeHead(404,{"content-type":"application/json"});
    res.end(JSON.stringify({status: "ERROR", error: "Route not found" }));

})

server.listen(PORT , ()=>{
    console.log(`Server is running on http://localhost:${PORT}`);
})