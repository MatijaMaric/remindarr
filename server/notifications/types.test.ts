import { describe, expect, it } from "bun:test";
import { PermanentDeliveryError, deliveryError } from "./types";
import { SubscriptionExpiredError } from "./webpush";

describe("deliveryError", () => {
  it.each([401, 403, 404, 410])("treats %d as permanent", (status) => {
    const err = deliveryError("Gotify request failed", status);
    expect(err).toBeInstanceOf(PermanentDeliveryError);
    expect(err.message).toBe(`Gotify request failed (${status})`);
  });

  it.each([400, 408, 429, 500, 503])("treats %d as retryable", (status) => {
    const err = deliveryError("Gotify request failed", status);
    expect(err).not.toBeInstanceOf(PermanentDeliveryError);
    expect(err.message).toBe(`Gotify request failed (${status})`);
  });

  it("classifies expired push subscriptions as permanent", () => {
    expect(
      new SubscriptionExpiredError("https://push.example/x"),
    ).toBeInstanceOf(PermanentDeliveryError);
  });
});
