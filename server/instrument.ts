import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    integrations: [Sentry.honoIntegration()],
    tracesSampleRate: 1.0,
    sendDefaultPii: true,
  });
}
