import type { Title } from "../types";

export function getEffectiveStatus(
  title: Pick<Title, "user_status" | "show_status">,
) {
  return title.user_status ?? title.show_status ?? null;
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  watching: "status.watching",
  completed: "status.completed",
  on_hold: "status.onHold",
  dropped: "status.dropped",
  plan_to_watch: "status.planToWatch",
  caught_up: "tracked.sections.caughtUp",
  not_started: "tracked.sections.notStarted",
  unreleased: "tracked.sections.unreleased",
};

/** Translation key for an effective (user or show) status, or null if unknown. */
export function statusLabelKey(status: string | null | undefined) {
  return status ? (STATUS_LABEL_KEYS[status] ?? null) : null;
}
