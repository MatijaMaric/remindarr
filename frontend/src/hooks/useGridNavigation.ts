import { useEffect, useRef } from "react";
import { isInputFocused } from "./useKeyboardShortcut";

/**
 * Enables j/k keyboard navigation through title cards on the current page.
 * TitleCard marks its primary link with data-title-link for discovery.
 */
export function useGridNavigation(enabled = true) {
  const indexRef = useRef(-1);

  useEffect(() => {
    if (!enabled) return;
    indexRef.current = -1;

    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;
      if (e.key !== "j" && e.key !== "k") return;

      const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-title-link]"));
      if (cards.length === 0) return;

      e.preventDefault();

      // Sync index with actual DOM focus in case user clicked or tabbed
      const focusedIndex = cards.indexOf(document.activeElement as HTMLElement);
      const current = focusedIndex >= 0 ? focusedIndex : indexRef.current;

      if (e.key === "j") {
        indexRef.current = Math.min(current + 1, cards.length - 1);
      } else {
        indexRef.current = Math.max(current - 1, 0);
      }

      cards[indexRef.current].focus();
      cards[indexRef.current].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
