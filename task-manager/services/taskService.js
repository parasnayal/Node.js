import { taskEmitter } from "../events/taskEmitter";

const tasks = [];
let nextTaskId = 1;

export const createTask = async (taskData) => {
     if (
    typeof taskData?.title !== "string" ||
    !taskData.title.trim()
  ) {
    throw new Error("Task title is required");
  }

 const task = {
    id: nextTaskId++,
    title: taskData.title.trim(),
    createdAt: new Date().toISOString(),
  };

   tasks.push(task);

    taskEmitter.emit("taskCreated",task)

    return task;
}

export const deleteTask = async (taskId) => {
  const index = tasks.findIndex((task) => task.id === taskId);

  if (index === -1) {
    throw new Error("Task not found");
  }

  const [deletedTask] = tasks.splice(index, 1);

  // Emit only after successful deletion
  taskEmitter.emit("taskDeleted", deletedTask);

  return deletedTask;
};