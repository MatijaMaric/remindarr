import { useTranslation } from "react-i18next";

export default function StreamingRegion({
  country,
  help = false,
}: {
  country?: string;
  help?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="text-sm text-zinc-400 space-y-1">
      {country && <p>{t("streamingRegion.label", { country })}</p>}
      {help && (
        <p>
          {t("streamingRegion.help")}{" "}
          <a
            className="underline"
            href="https://github.com/MatijaMaric/remindarr#streaming-region"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("streamingRegion.configuration")}
          </a>
        </p>
      )}
    </div>
  );
}
