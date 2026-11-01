import {taskEmitter} from '../events/taskEmitter'

export const registerTaskListeners = () => {
    taskEmitter.on("taskCreated",(task)=>{
        console.log("Notification sent: ",task.title);
    });

    taskEmitter.on("taskCreated",(task)=>{
    console.log("Analytics updated:",task.id)
    })

    taskEmitter.on("taskDeleted",(task)=>{
        console.log("Audit: Task",task.id , "deleted")
    })
}