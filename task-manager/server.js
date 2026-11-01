import { registerTaskListeners } from "./listeners/taskListeners.js";
import {
  createTask,
  deleteTask,
} from "./services/taskService.js";

registerTaskListeners();

const task = await createTask({
  title: "Learn Node.js",
});

await deleteTask(task.id);