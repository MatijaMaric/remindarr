import { useRef, useState, useCallback, useEffect } from "react";

interface ScrollableRowProps {
  children: React.ReactNode;
  /** CSS classes for the inner flex container (controls gap, padding, etc.) */
  className?: string;
  /** Pixels to scroll per click. Defaults to 332 (320 + 12). */
  scrollAmount?: number;
  /** Enable scroll-snap-type: x mandatory. Defaults to false. */
  scrollSnap?: boolean;
}

export default function ScrollableRow({
  children,
  className,
  scrollAmount = 332,
  scrollSnap = false,
}: ScrollableRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollButtons();
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    const observer = new ResizeObserver(updateScrollButtons);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollButtons);
      observer.disconnect();
    };
  }, [updateScrollButtons]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <div className="relative group/scroll">
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-20 bg-zinc-800/90 hover:bg-zinc-700 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg cursor-pointer opacity-0 group-hover/scroll:opacity-100 transition-opacity"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}
      <div
        ref={scrollRef}
        className={`flex overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${className ?? ""}`}
        style={scrollSnap ? { scrollSnapType: "x mandatory" } : undefined}
      >
        {children}
      </div>
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-20 bg-zinc-800/90 hover:bg-zinc-700 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg cursor-pointer opacity-0 group-hover/scroll:opacity-100 transition-opacity"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
