import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTORS =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus inside `containerRef` when `isOpen` is true.
 *
 * - On open: saves the current active element and focuses the first focusable
 *   child (or the container itself when none are found).
 * - While open: Tab and Shift+Tab cycle within the container without escaping
 *   to the background.
 * - On close: focus is restored to the element that was active when the trap
 *   was engaged.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
): void {
  // Keep a stable ref to the element that was focused before the trap opened
  const savedFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Restore focus to whoever had it when the modal opened
      if (savedFocusRef.current && savedFocusRef.current instanceof HTMLElement) {
        savedFocusRef.current.focus();
      }
      savedFocusRef.current = null;
      return;
    }

    // Save active element
    savedFocusRef.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    // Focus first focusable child, or the container itself
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
    ).filter((el) => !el.hasAttribute("disabled"));

    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      container.focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;

      const innerContainer = containerRef.current;
      if (!innerContainer) return;

      const focusableNow = Array.from(
        innerContainer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
      ).filter((el) => !el.hasAttribute("disabled"));

      if (focusableNow.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusableNow[0];
      const last = focusableNow[focusableNow.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        // Shift+Tab: if on first, wrap to last
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if on last, wrap to first
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, containerRef]);
}
