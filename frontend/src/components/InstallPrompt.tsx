import { Download, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

export default function InstallPrompt() {
  const { user } = useAuth();
  const { canInstall, promptInstall, dismiss } = useInstallPrompt();

  if (!user || !canInstall) return null;

  return (
    <div
      role="banner"
      className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-amber-200">
          <Download className="size-4 shrink-0" />
          <span>Install Remindarr for a better experience</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={promptInstall}
            className="text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
          >
            Install
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
