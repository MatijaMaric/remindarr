const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  import("@sentry/react").then(async (Sentry) => {
    const { useEffect } = await import("react");
    const { useLocation, useNavigationType, createRoutesFromChildren, matchRoutes } =
      await import("react-router");

    Sentry.init({
      dsn,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
        Sentry.reactRouterV7BrowserTracingIntegration({
          useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      ],
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
  });
}
