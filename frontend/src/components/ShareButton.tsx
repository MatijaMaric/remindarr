import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Props {
  title?: string;
  text?: string;
  url?: string;
}

export default function ShareButton({ title, text, url }: Props) {
  const { t } = useTranslation();

  async function handleShare() {
    const shareUrl = url || window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url: shareUrl,
        });
      } catch (err: unknown) {
        // User cancelled the share dialog — not an error
        if (err instanceof Error && err.name === "AbortError") return;
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success(t("common.linkCopied"));
      } catch {
        toast.error(t("common.linkCopyFailed"));
      }
    }
  }

  return (
    <button
      onClick={handleShare}
      className="min-h-8 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer bg-muted text-muted-foreground hover:bg-muted-hover hover:text-foreground"
      title={t("common.share")}
    >
      <Share2 className="size-3.5" />
      {t("common.share")}
    </button>
  );
}
