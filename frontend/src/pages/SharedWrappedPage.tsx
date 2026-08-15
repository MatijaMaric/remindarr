import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getSharedWrapped } from "../api";
import { PageHeader } from "../components/design";
import { WrappedSummary } from "./WrappedSummary";

export default function SharedWrappedPage() {
  const { t } = useTranslation();
  const { token, year: yearParam } = useParams<{
    token: string;
    year: string;
  }>();
  const year = Number(yearParam);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shared-wrapped", token, year],
    queryFn: ({ signal }) => getSharedWrapped(token!, year, signal),
    enabled: !!token && Number.isInteger(year),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-zinc-800 rounded animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-zinc-900 rounded-xl p-4 h-20 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <h1 className="text-xl font-bold text-zinc-100">
          {t("wrapped.invalidLink")}
        </h1>
        <p className="text-sm text-zinc-500">{t("wrapped.invalidLinkHint")}</p>
        <Link
          to="/"
          className="text-amber-400 hover:text-amber-300 text-sm transition-colors"
        >
          {t("wrapped.goHome")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        kicker={t("wrapped.kicker")}
        title={t("wrapped.sharedBy", {
          year: data.year,
          username: data.username,
        })}
      />
      <WrappedSummary data={data} />
    </div>
  );
}
