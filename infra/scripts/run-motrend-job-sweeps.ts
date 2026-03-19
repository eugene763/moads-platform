import {disconnectPrisma, sweepStaleMotrendJobs} from "@moads/db";

import {buildApp} from "../../services/api/src/app.js";

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

const limitValue = Number(readFlag("--limit") ?? "100");

const app = await buildApp();

try {
  const result = await sweepStaleMotrendJobs(app.prisma, {
    limitPerBucket: Number.isFinite(limitValue) ? Math.max(1, Math.min(Math.floor(limitValue), 500)) : 100,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await app.close();
  await disconnectPrisma();
}
