import {EventEmitter} from 'events';

// const emitter = new EventEmitter();

// emitter.on("greet",()=>{
//     console.log("Hello from Node.js!");
// })

// emitter.on("userRegistered",(user)=>{
// console.log("user",user)
// })

// emitter.emit("greet");

// emitter.emit("userRegistered",{
//   id: 101,
//   name: "Rahul",
//   email: "rahul@example.com",
// });

// emitter.once("connected",()=>{
//     console.log("Once connected");
// })

// emitter.emit("connected");
// emitter.emit("connected");

// emitter.off()


// const emitter = new EventEmitter();

// emitter.on("taskCreated",(detail)=>{
//     console.log("Task created:",detail.title)
// })

// emitter.on("taskCreated",()=>{
//     console.log("Task creation logged");
// })

// emitter.on("taskDeleted",(user)=>{
//     console.log("Task deleted:",user.id);
// })

// emitter.emit("taskCreated",{
//     id: 1, title: "Learn Node.js Events"
// });

// emitter.emit("taskDeleted",{id:1})


// const emitter = new EventEmitter();

// emitter.on("taskCreated",(detail)=>{
// if( typeof detail?.title !== "string" || !detail.title.trim()){
//     emitter.emit("error",new Error("Task title is required"));

//     return;
// }
// console.log("Task created:",detail.title)
// })


// emitter.on("error",(error)=>{
//     console.log(error.message)
// })

// emitter.emit("taskCreated",{
//     id: 1, title: "Learn Node.js Events"
// })

// emitter.emit("taskCreated",{
//     id: 1, title: ""
// })


const emitter = new EventEmitter();

const sendNotification = (detail) => {
console.log("Notification sent:" , detail.title);
}

const updateAnalytics = (detail) => {
console.log("Analytics updated:" , detail.title);
}

emitter.on('taskCreated',sendNotification);

emitter.on('taskCreated',updateAnalytics);

console.log(emitter.listenerCount("taskCreated"))

emitter.emit("taskCreated",{
    id:1,
    title :"Learn Node.js"
});

emitter.off("taskCreated",sendNotification);

console.log(emitter.listenerCount("taskCreated"))

emitter.emit("taskCreated",{
    id:1,
    title :"Learn Node.js"
});