import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import * as api from "../api";
import { PageHeader } from "../components/design";
import { WrappedSummary } from "./WrappedSummary";

function currentUtcYear(): number {
  return new Date().getUTCFullYear();
}

export default function WrappedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { year: yearParam } = useParams<{ year?: string }>();
  const year = Number(yearParam) || currentUtcYear();
  const [sharing, setSharing] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["year-in-review", year],
    queryFn: ({ signal }) => api.getYearInReview(year, signal),
    enabled: Number.isInteger(year) && year >= 1970,
  });

  const { data: tokenData } = useQuery({
    queryKey: ["wrapped-share-token", year],
    queryFn: ({ signal }) => api.getWrappedShareToken(year, signal),
  });

  const years = useMemo(() => {
    const set = new Set(data?.years ?? []);
    set.add(year);
    set.add(currentUtcYear());
    return [...set].sort((a, b) => b - a);
  }, [data?.years, year]);

  async function handleShare() {
    setSharing(true);
    try {
      let token = tokenData?.token;
      if (!token) {
        const created = await api.regenerateWrappedShareToken(year);
        token = created.token;
        await queryClient.invalidateQueries({
          queryKey: ["wrapped-share-token", year],
        });
      }
      const url = `${window.location.origin}/share/wrapped/${token}/${year}`;
      const title = t("wrapped.title", { year });
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        kicker={t("wrapped.kicker")}
        title={t("wrapped.title", { year })}
        right={
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="wrapped-year">
              {t("wrapped.yearLabel")}
            </label>
            <select
              id="wrapped-year"
              className="bg-card border border-input rounded-sm text-sm px-2 py-1.5 text-foreground-secondary"
              value={year}
              onChange={(e) => navigate(`/wrapped/${e.target.value}`)}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                void handleShare();
              }}
              disabled={sharing}
              className="min-h-8 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer bg-muted text-muted-foreground hover:bg-muted-hover hover:text-foreground disabled:opacity-50"
              title={t("wrapped.share")}
            >
              <Share2 className="size-3.5" />
              {t("wrapped.share")}
            </button>
          </div>
        }
      />

      <p className="text-sm text-muted-foreground">
        A shared link reveals only your {year} review. Older shared links must
        be recreated; watchlist links remain separate.
      </p>
      {tokenData?.token && (
        <button
          type="button"
          disabled={sharing}
          onClick={async () => {
            setSharing(true);
            try {
              await api.revokeWrappedShareToken(year);
              await queryClient.invalidateQueries({
                queryKey: ["wrapped-share-token", year],
              });
              toast.success("Review link revoked");
            } catch {
              toast.error("Could not revoke review link. Please retry.");
            } finally {
              setSharing(false);
            }
          }}
        >
          Revoke {year} review link
        </button>
      )}
      {isError && (
        <p className="text-muted-foreground text-sm py-12 text-center">
          {t("wrapped.loadError")}
        </p>
      )}

      {(isLoading || !data) && !isError && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-lg p-4 h-20 animate-pulse"
            />
          ))}
        </div>
      )}

      {data && <WrappedSummary data={data} />}

      <p className="text-xs text-muted-foreground">
        <Link to="/tracked?view=stats" className="hover:text-muted-foreground">
          ← {t("nav.stats")}
        </Link>
      </p>
    </div>
  );
}
