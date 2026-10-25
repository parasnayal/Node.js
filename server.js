import http from "http";

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

let nextTaskId = Math.max(0, ...TASKS.map(task => task.id)) + 1;

const server = http.createServer((req,res)=>{
    const url = new URL (req.url, `http://${req.headers.host || "localhost"}`);

    if(req.method === "GET" && url.pathname === "/health"){
        res.writeHead(200,{"content-type":"application/json"});

        return res.end(JSON.stringify({status:"OK"}));
    }

    const taskRoute = url.pathname.match(/^\/tasks\/([^/]+)$/);

    if(req.method === "GET" && url.pathname === "/tasks"){
        res.writeHead(200,{"content-type":"application/json"});

       return res.end(JSON.stringify({status:"OK",data:TASKS}));
    }

    if(req.method === "GET" && taskRoute ){
        const taskId = taskRoute[1];

        if (!validateTaskId(taskId)) {
         res.writeHead(400,{"content-type":"application/json"});

        return res.end(JSON.stringify({status:"ERROR",message:"Invalid task ID"}));
        }

        const taskById = TASKS.find(taskItem => taskItem.id === parseInt(taskId));

        if(!taskById) {
            res.writeHead(404,{"content-type":"application/json"});

            return res.end(JSON.stringify({status:"ERROR",message:"Task not found"}))
        }

        res.writeHead(200,{"content-type":"application/json"});

        return res.end(JSON.stringify({status:"OK",data:taskById}));
    }

        if(req.method === "DELETE" && taskRoute ){
        const taskId = taskRoute[1];
        
        if (!validateTaskId(taskId)) {
         res.writeHead(400,{"content-type":"application/json"});

        return res.end(JSON.stringify({status:"ERROR",message:"Invalid task ID"}))
        }

        const deletedTask = TASKS.findIndex(taskItem => taskItem.id === parseInt(taskId));

        if(deletedTask === -1){
            res.writeHead(404,{"content-type":"application/json"});

            return res.end(JSON.stringify({status:"ERROR",message:"Task not found"}))
        }

        TASKS.splice(deletedTask,1);

        res.writeHead(204);

        res.end();
    }

    if(req.method === "POST" && url.pathname === "/tasks"){
        let body = "";

        req.on("data",(chunk)=>{
            body += chunk.toString();
            
        })

        req.on("end",()=>{
           try{
            const payload = JSON.parse(body);

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

            const newTask = {
                id: nextTaskId++,
                title: payload.title.trim(),
                completed: false,
            }

            TASKS.push(newTask);
            
            res.writeHead(201,{"content-type":"application/json"});

            return res.end(JSON.stringify({status:"OK",data:newTask}));
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