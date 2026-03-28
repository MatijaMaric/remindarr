import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";
import UserSearchDropdown from "./UserSearchDropdown";
import type { SelectedUser } from "./UserSearchDropdown";
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
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (!user) return null;

  function handleOpen() {
    setSelectedUser(null);
    setMessage("");
    setDialogOpen(true);
  }

  async function handleSend() {
    if (!selectedUser) return;
    setSending(true);
    try {
      await api.sendRecommendation(selectedUser.id, titleId, message || undefined);
      toast.success("Recommendation sent!");
      setDialogOpen(false);
      setSelectedUser(null);
      setMessage("");
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
        className="min-h-8 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
        title="Recommend"
      >
        <Send className="size-3.5" />
        Recommend
      </button>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogPopup>
          <AlertDialogTitle>Recommend to a friend</AlertDialogTitle>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Send to</label>
              <UserSearchDropdown
                onSelect={setSelectedUser}
                selected={selectedUser}
                onClear={() => setSelectedUser(null)}
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">
                Message <span className="text-zinc-500">(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 280))}
                placeholder="Why should they watch this?"
                maxLength={280}
                rows={3}
                className="w-full bg-zinc-800 text-white rounded-md px-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500 border border-zinc-700 resize-none"
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
              disabled={!selectedUser || sending}
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
