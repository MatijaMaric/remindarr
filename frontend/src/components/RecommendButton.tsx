import { useState, useEffect } from "react";
import { Send, Check } from "lucide-react";
import { toast } from "sonner";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogClose,
} from "./ui/alert-dialog";

interface Props {
  titleId: string;
}

export default function RecommendButton({ titleId }: Props) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [recommended, setRecommended] = useState(false);
  const [recId, setRecId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.checkRecommendation(titleId).then((data) => {
      if (cancelled) return;
      setRecommended(data.recommended);
      setRecId(data.id);
    }).catch(() => {
      // Silently ignore check failures
    });
    return () => { cancelled = true; };
  }, [user, titleId]);

  if (!user) return null;

  function handleOpen() {
    if (recommended) {
      // Unrecommend
      handleUnrecommend();
      return;
    }
    setMessage("");
    setDialogOpen(true);
  }

  async function handleUnrecommend() {
    if (!recId) return;
    setSending(true);
    try {
      await api.deleteRecommendation(recId);
      setRecommended(false);
      setRecId(null);
      toast.success("Recommendation removed");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to remove recommendation";
      toast.error(errorMessage);
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    setSending(true);
    try {
      const result = await api.sendRecommendation(titleId, message || undefined);
      toast.success("Recommendation sent!");
      setDialogOpen(false);
      setMessage("");
      setRecommended(true);
      setRecId(result.id);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send recommendation";
      toast.error(errorMessage);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={sending}
        className={`min-h-8 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
          recommended
            ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={recommended ? "Recommended" : "Recommend"}
      >
        {recommended ? <Check className="size-3.5" /> : <Send className="size-3.5" />}
        {recommended ? "Recommended" : "Recommend"}
      </button>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogPopup>
          <AlertDialogTitle>Recommend this title</AlertDialogTitle>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">
                Message <span className="text-zinc-500">(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 280))}
                placeholder="Why should people watch this?"
                maxLength={280}
                rows={3}
                className="w-full bg-zinc-800 text-white rounded-md px-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 border border-zinc-700 resize-none"
                data-testid="recommend-message"
              />
              <div className="text-xs text-zinc-500 text-right mt-1">
                {message.length}/280
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogClose
              className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 cursor-pointer transition-colors"
            >
              Cancel
            </AlertDialogClose>
            <button
              onClick={handleSend}
              disabled={sending}
              className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-amber-500 text-zinc-950 hover:bg-amber-400 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="recommend-send"
            >
              <Send className="size-3.5" />
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
