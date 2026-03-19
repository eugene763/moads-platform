import {disconnectPrisma} from "@moads/db";

import {buildApp} from "../../services/api/src/app.js";
import {cleanupExpiredMotrendDownloads} from "../../services/api/src/lib/motrend-download-cleanup.js";

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

const limitValue = Number(readFlag("--limit") ?? "200");

const app = await buildApp();

try {
  const result = await cleanupExpiredMotrendDownloads(app, {
    limit: Number.isFinite(limitValue) ? Math.max(1, Math.min(Math.floor(limitValue), 500)) : 200,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await app.close();
  await disconnectPrisma();
}
