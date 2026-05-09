/**
 * CF-safe job enqueue using Drizzle ORM (no bun:sqlite dependency).
 *
 * Use this module instead of queue.ts in shared server code (routes, triggers,
 * etc.) that is bundled for both Bun and Cloudflare Workers. The Bun job
 * worker polls the DB for pending rows the same as it does for any other insert.
 */
import { getDb, jobs } from "../db/schema";

export async function enqueueJob(
  name: string,
  data?: Record<string, unknown>,
  options?: { runAt?: Date; maxAttempts?: number }
): Promise<void> {
  const db = getDb();
  await db.insert(jobs).values({
    name,
    data: data ? JSON.stringify(data) : null,
    runAt: (options?.runAt ?? new Date()).toISOString(),
    maxAttempts: options?.maxAttempts ?? 3,
  });
}
