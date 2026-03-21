import { logger } from "./logger";
import Sentry from "./sentry";

const log = logger.child({ module: "shutdown" });

const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface ShutdownDeps {
  server: { stop: () => void };
  stopWorker: () => void;
  closeDb: () => void;
}

export function createShutdownHandler(deps: ShutdownDeps): (signal: string) => Promise<void> {
  return async function shutdown(signal: string): Promise<void> {
    log.info("Shutting down", { signal });

    const timer = setTimeout(() => {
      log.warn("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    // Stop accepting new connections and wait for in-flight requests to complete
    deps.server.stop();

    // Stop background job worker intervals
    deps.stopWorker();

    // Flush Sentry events before exit
    await Sentry.flush(2000);

    // Close DB connection cleanly
    deps.closeDb();

    clearTimeout(timer);
    log.info("Shutdown complete");
    process.exit(0);
  };
}
