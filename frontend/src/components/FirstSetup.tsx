import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";
import StreamingRegion from "./StreamingRegion";

export default function FirstSetup() {
  const { user, subscriptions } = useAuth();
  return user ? (
    <SetupSteps
      key={user.id}
      userId={user.id}
      services={subscriptions?.providerIds.length}
    />
  ) : null;
}

function SetupSteps({
  userId,
  services,
}: {
  userId: string;
  services?: number;
}) {
  const storageKey = `setup-dismissed:${userId}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== "1";
    } catch {
      return true;
    }
  });
  const providers = useQuery({
    queryKey: ["subscription-providers"],
    queryFn: ({ signal }) => api.getProviders(signal),
    enabled: open,
  });
  const tracked = useQuery({
    queryKey: ["tracked"],
    queryFn: ({ signal }) => api.getTrackedTitles(signal),
    enabled: open,
  });
  const notifiers = useQuery({
    queryKey: ["notifiers"],
    queryFn: ({ signal }) => api.getNotifiers(signal),
    enabled: open,
  });
  function toggle(value: boolean) {
    setOpen(value);
    try {
      localStorage.setItem(storageKey, value ? "0" : "1");
    } catch {
      /* The guide remains usable without storage. */
    }
  }
  if (!open)
    return (
      <button
        type="button"
        onClick={() => toggle(true)}
        className="text-sm underline"
      >
        Resume setup guide
      </button>
    );
  return (
    <section
      aria-label="First reminder setup"
      className="rounded-xl border border-white/10 p-4 space-y-3"
    >
      <h2 className="text-lg font-semibold">Set up your first reminder</h2>
      <StreamingRegion country={providers.data?.country} help />
      <ol className="list-decimal pl-5 space-y-2 text-sm">
        <li>
          <Link className="underline" to="/settings?tab=subscriptions">
            Choose your streaming services
          </Link>{" "}
          —{" "}
          {services === undefined
            ? "preferences not loaded"
            : `${services} selected`}
          .
        </li>
        <li>
          <Link className="underline" to="/browse">
            Find and track a title
          </Link>{" "}
          —{" "}
          {tracked.data
            ? `${tracked.data.titles.length} tracked`
            : tracked.isError
              ? "could not load your library"
              : "loading library"}
          . Rate a few titles to improve discovery.
        </li>
        <li>
          <Link className="underline" to="/settings?tab=notifications">
            Configure a destination and send a test
          </Link>{" "}
          —{" "}
          {notifiers.data
            ? notifiers.data.notifiers.some((n) => n.enabled)
              ? "destination configured; delivery still needs checking"
              : "no enabled destination"
            : notifiers.isError
              ? "could not check destinations"
              : "checking destinations"}
          .
        </li>
      </ol>
      <p className="text-sm text-zinc-400">
        In Notifications, use Test, check delivery history, and confirm the
        message arrived. Saving settings or granting browser permission does not
        verify delivery.
      </p>
      {(providers.isError || tracked.isError || notifiers.isError) && (
        <button
          type="button"
          className="underline"
          onClick={() => {
            void providers.refetch();
            void tracked.refetch();
            void notifiers.refetch();
          }}
        >
          Retry setup status
        </button>
      )}
      <button
        type="button"
        onClick={() => toggle(false)}
        className="text-sm underline"
      >
        Skip for now
      </button>
    </section>
  );
}
