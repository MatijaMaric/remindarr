import { Share2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  title?: string;
  text?: string;
  url?: string;
}

export default function ShareButton({ title, text, url }: Props) {
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
        toast.success("Link copied to clipboard");
      } catch {
        toast.error("Failed to copy link");
      }
    }
  }

  return (
    <button
      onClick={handleShare}
      className="min-h-8 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
      title="Share"
    >
      <Share2 className="size-3.5" />
      Share
    </button>
  );
}
