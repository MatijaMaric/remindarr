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
      className="bg-primary-soft border-b border-primary-border px-4 py-2.5"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-primary-text">
          <Download className="size-4 shrink-0" />
          <span>Install Remindarr for a better experience</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={promptInstall}
            className="text-sm font-medium text-primary-text hover:text-primary-text transition-colors cursor-pointer"
          >
            Install
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="text-muted-foreground hover:text-foreground-secondary transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
