import { useEffect, useRef } from "react";

export function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement).isContentEditable;
}

/**
 * Registers a global keyboard shortcut. The callback is skipped when focus is
 * inside an input, textarea, select, or contenteditable element.
 */
export function useKeyboardShortcut(key: string, callback: () => void) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;
      if (e.key === key && !e.ctrlKey && !e.metaKey && !e.altKey) {
        callbackRef.current();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [key]);
}
