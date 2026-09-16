import Sentry from "./sentry";
import { redactTelemetry } from "./lib/telemetry-redaction";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    integrations: [Sentry.honoIntegration()],
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
    beforeSend: redactTelemetry,
    beforeSendTransaction: redactTelemetry,
    beforeSendSpan: redactTelemetry,
  });
}
