import { runEvaluateAchievements } from "./achievement-handlers";
import { registerHandler } from "./worker";

export { runEvaluateAchievements };

registerHandler("evaluate-achievements", (job) =>
  runEvaluateAchievements(job.data),
);
