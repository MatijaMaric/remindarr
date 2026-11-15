import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "../api";
import type { Title } from "../types";
import StatusPicker from "./StatusPicker";
import NotificationModePicker from "./NotificationModePicker";
import TagList from "./TagList";

interface Props {
  title: Title;
  /** Called after any change so the caller can refetch the library. */
  onChange: () => void;
}

/** "···" menu holding a tracked title's status, reminders, tags and untrack. */
export default function TrackedActionsMenu({ title, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={t("tracked.row.moreActions", { title: title.title })}
        className="min-w-11 min-h-11 shrink-0 rounded-sm text-foreground-secondary hover:bg-muted"
      >
        ···
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={4}
          className="z-50"
        >
          <Popover.Popup className="w-64 max-w-[calc(100vw-2rem)] rounded-md bg-card border border-border shadow-xl p-3 space-y-3">
            <Popover.Title className="font-semibold text-sm break-words">
              {title.title}
            </Popover.Title>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("tracked.columns.status")}
              </p>
              <StatusPicker
                titleId={title.id}
                objectType={title.object_type}
                currentStatus={title.user_status}
                onStatusChange={onChange}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("notifications.label")}
              </p>
              <NotificationModePicker
                titleId={title.id}
                currentMode={title.notification_mode ?? null}
                snoozeUntil={title.snooze_until}
                remindOnRelease={title.remind_on_release}
                releaseDate={title.release_date}
                onModeChange={onChange}
                onSnoozed={onChange}
                onRemindOnReleaseChange={onChange}
              />
            </div>
            <TagList
              titleId={title.id}
              tags={title.tags ?? []}
              onTagsChange={onChange}
            />
            {title.tmdb_url && (
              <a
                href={title.tmdb_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm min-h-10"
              >
                {t("tracked.row.openTmdb")} ↗
              </a>
            )}
            <button
              type="button"
              className="text-sm text-destructive min-h-10"
              onClick={async () => {
                try {
                  await api.untrackTitle(title.id);
                  onChange();
                } catch {
                  toast.error(t("common.error"));
                }
              }}
            >
              {t("tracked.row.untrack")}
            </button>
            <Popover.Close className="block min-h-10 text-sm">
              {t("common.close")}
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
