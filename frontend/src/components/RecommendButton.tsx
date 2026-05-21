import { useState } from "react";
import { Send, Check, Users, User } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogClose,
} from "./ui/alert-dialog";
import UserSearchDropdown, { type SelectedUser } from "./UserSearchDropdown";

interface Props {
  titleId: string;
}

type AudienceMode = "all" | "pick";

export default function RecommendButton({ titleId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [targetUser, setTargetUser] = useState<SelectedUser | null>(null);

  const { data: recData } = useQuery({
    queryKey: ["recommendation-check", titleId],
    enabled: !!user,
    queryFn: () => api.checkRecommendation(titleId),
  });

  const recommended = recData?.recommended ?? false;
  const recId = recData?.id ?? null;

  const sendMutation = useMutation({
    mutationFn: ({ message: msg, recipientId }: { message?: string; recipientId?: string }) =>
      api.sendRecommendation(titleId, msg, recipientId),
    onSuccess: () => {
      setDialogOpen(false);
      setMessage("");
      setTargetUser(null);
      const successMsg =
        audienceMode === "pick" && targetUser
          ? `Recommendation sent to @${targetUser.username}!`
          : "Recommendation sent to all followers!";
      toast.success(successMsg);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to send recommendation");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["recommendation-check", titleId] });
      void qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteRecommendation(recId!),
    onSuccess: () => {
      toast.success("Recommendation removed");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to remove recommendation");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["recommendation-check", titleId] });
      void qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });

  if (!user) return null;

  const sending = sendMutation.isPending || deleteMutation.isPending;

  function handleOpen() {
    if (recommended) {
      deleteMutation.mutate();
      return;
    }
    setMessage("");
    setAudienceMode("all");
    setTargetUser(null);
    setDialogOpen(true);
  }

  function handleSend() {
    if (audienceMode === "pick" && !targetUser) {
      toast.error("Please select a recipient");
      return;
    }
    sendMutation.mutate({
      message: message || undefined,
      recipientId: audienceMode === "pick" ? targetUser?.id : undefined,
    });
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
            {/* Audience picker */}
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Send to</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setAudienceMode("all"); setTargetUser(null); }}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                    audienceMode === "all"
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700"
                  }`}
                  data-testid="audience-all"
                >
                  <Users className="size-3.5" />
                  All followers
                </button>
                <button
                  type="button"
                  onClick={() => setAudienceMode("pick")}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                    audienceMode === "pick"
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700"
                  }`}
                  data-testid="audience-pick"
                >
                  <User className="size-3.5" />
                  Pick a person
                </button>
              </div>
            </div>

            {/* User picker — shown when "Pick a person" is selected */}
            {audienceMode === "pick" && (
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Recipient</label>
                <UserSearchDropdown
                  selected={targetUser}
                  onSelect={(u) => setTargetUser(u)}
                  onClear={() => setTargetUser(null)}
                />
              </div>
            )}

            {/* Message */}
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
              disabled={sending || (audienceMode === "pick" && !targetUser)}
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
