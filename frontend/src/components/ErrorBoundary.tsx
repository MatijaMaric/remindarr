import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "../logger";
import { isChunkLoadError } from "../lib/lazyWithRetry";
import { reloadPage } from "../lib/reloadPage";

const log = logger.child({ module: "error-boundary" });

interface Props {
  children: ReactNode;
  /**
   * "page" (default) — full-screen fallback used at the app root.
   * "inline" — compact fallback suitable for per-route wrapping inside the
   *   main content area, so a single page crash doesn't nuke the shell.
   */
  variant?: "page" | "inline";
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error("Unhandled render error", {
      error,
      componentStack: info.componentStack,
    });
    import("@sentry/react")
      .then((Sentry) => {
        Sentry.captureException(error, {
          tags: { errorType: isChunkLoadError(error) ? "chunk-load" : "render" },
          contexts: { react: { componentStack: info.componentStack } },
        });
      })
      .catch(() => {});
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = (): Promise<void> => {
    return caches.delete("pages").then(() => {}).catch(() => {}).finally(() => reloadPage());
  };

  render() {
    if (this.state.hasError) {
      const variant = this.props.variant ?? "page";
      const outerClass =
        variant === "inline"
          ? "py-12 px-4 flex items-center justify-center"
          : "min-h-screen bg-zinc-950 flex items-center justify-center p-4";

      if (isChunkLoadError(this.state.error)) {
        return (
          <div className={outerClass}>
            <div className="max-w-md w-full bg-zinc-900 border border-red-800 rounded-lg p-6 text-center">
              <h1 className="text-xl font-bold text-red-400 mb-2">
                A new version is available
              </h1>
              <p className="text-zinc-400 text-sm mb-4">
                Refresh to load the latest version.
              </p>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                Refresh
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className={outerClass}>
          <div className="max-w-md w-full bg-zinc-900 border border-red-800 rounded-lg p-6 text-center">
            <h1 className="text-xl font-bold text-red-400 mb-2">
              Something went wrong
            </h1>
            <p className="text-zinc-400 text-sm mb-4">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
