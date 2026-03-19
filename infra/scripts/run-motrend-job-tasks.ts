import {MotrendTaskType, disconnectPrisma} from "@moads/db";

import {buildApp} from "../../services/api/src/app.js";
import {processDueMotrendTasks} from "../../services/api/src/lib/motrend-task-runner.js";

function readFlag(name: string): string | null {
  const prefix = `${name}=`;
  const entry = process.argv.slice(2).find((value) => value === name || value.startsWith(prefix));
  if (!entry) {
    return null;
  }

  if (entry === name) {
    return "true";
  }

  return entry.slice(prefix.length);
}

function parseTaskType(value: string | null): MotrendTaskType | undefined {
  if (value === "submit") {
    return MotrendTaskType.SUBMIT;
  }

  if (value === "poll") {
    return MotrendTaskType.POLL;
  }

  return undefined;
}

const limitValue = Number(readFlag("--limit") ?? "10");
const taskType = parseTaskType(readFlag("--task-type"));

const app = await buildApp();

try {
  const result = await processDueMotrendTasks(app, {
    limit: Number.isFinite(limitValue) ? Math.max(1, Math.min(Math.floor(limitValue), 50)) : 10,
    ...(taskType ? {taskType} : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await app.close();
  await disconnectPrisma();
}
