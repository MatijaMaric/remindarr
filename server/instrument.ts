import Sentry from "./sentry";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    integrations: [Sentry.honoIntegration()],
    tracesSampleRate: 1.0,
    sendDefaultPii: true,
  });
}
