import type { Title } from "../types";

export function getEffectiveStatus(
  title: Pick<Title, "user_status" | "show_status">,
) {
  return title.user_status ?? title.show_status ?? null;
}
