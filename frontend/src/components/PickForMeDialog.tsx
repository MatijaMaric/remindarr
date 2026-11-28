import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import * as api from "../api";
import { Pill } from "./design";
import { Button, buttonVariants } from "./ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

const DISMISSED_KEY = "pickForMe.dismissed";

function readDismissed(): string[] {
  try {
    return (sessionStorage.getItem(DISMISSED_KEY) ?? "")
      .split(",")
      .filter(Boolean)
      .slice(-200);
  } catch {
    return [];
  }
}

export default function PickForMeDialog() {
  const { t, i18n } = useTranslation();
  const minutes = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "unit",
    unit: "minute",
  });
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"MOVIE" | "SHOW">();
  const [maxRuntime, setMaxRuntime] = useState<number>();
  const [availableOnly, setAvailableOnly] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);
  const pick = useMutation({
    mutationFn: (exclude: string[]) =>
      api.pickTrackedTitle({ type, maxRuntime, availableOnly, exclude }),
    onError: () => toast.error(t("pickForMe.error")),
  });
  const title = pick.data;

  function another(id: string) {
    const next = [...new Set([...dismissed, id])].slice(-200);
    setDismissed(next);
    try {
      sessionStorage.setItem(DISMISSED_KEY, next.join(","));
    } catch {
      // The in-memory list still works when storage is unavailable.
    }
    pick.mutate(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" />}>
        {t("pickForMe.title")}
      </AlertDialogTrigger>
      <AlertDialogPopup className="max-w-[min(28rem,calc(100%-2rem))] space-y-4">
        <AlertDialogTitle>{t("pickForMe.title")}</AlertDialogTitle>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-sm">{t("pickForMe.type")}</legend>
          {([undefined, "MOVIE", "SHOW"] as const).map((value) => (
            <Pill
              key={value ?? "any"}
              active={type === value}
              onClick={() => setType(value)}
            >
              {t(
                value === "MOVIE"
                  ? "calendar.movie"
                  : value === "SHOW"
                    ? "calendar.show"
                    : "pickForMe.any",
              )}
            </Pill>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-sm">{t("pickForMe.runtime")}</legend>
          {[undefined, 30, 100].map((value) => (
            <Pill
              key={value ?? "any"}
              active={maxRuntime === value}
              onClick={() => setMaxRuntime(value)}
            >
              {value === undefined
                ? t("pickForMe.any")
                : `≤${minutes.format(value)}`}
            </Pill>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(event) => setAvailableOnly(event.target.checked)}
          />
          {t("pickForMe.available")}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pick.isPending}
            onClick={() => pick.mutate(dismissed)}
          >
            {t("pickForMe.pick")}
          </Button>
          <AlertDialogClose render={<Button variant="ghost" />}>
            {t("calendar.close")}
          </AlertDialogClose>
        </div>
        <div aria-live="polite" aria-busy={pick.isPending}>
          {title === null && <p>{t("browse.noResults")}</p>}
          {title && (
            <div className="flex gap-3 rounded-md border border-border p-3">
              {title.poster_url && (
                <img
                  src={title.poster_url}
                  alt=""
                  className="w-16 self-start rounded-sm"
                />
              )}
              <div className="min-w-0 space-y-2">
                <h3 className="font-semibold">{title.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {[
                    title.release_year,
                    title.runtime_minutes != null &&
                      minutes.format(title.runtime_minutes),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={`/title/${title.id}`}
                    className={buttonVariants()}
                    onClick={() => setOpen(false)}
                  >
                    {t("episodes.watch")}
                  </Link>
                  <Button variant="outline" onClick={() => another(title.id)}>
                    {t("pickForMe.another")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
