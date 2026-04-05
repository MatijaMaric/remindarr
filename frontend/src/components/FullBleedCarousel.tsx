import { useRef, useState, useCallback, useEffect } from "react";

interface FullBleedCarouselProps {
  children: React.ReactNode;
  /** Pixels to scroll per click. Defaults to 332 (320 card + 12 gap). */
  scrollAmount?: number;
}

export default function FullBleedCarousel({
  children,
  scrollAmount = 332,
}: FullBleedCarouselProps) {
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

  // Arrow positioned just inside the body edge: max(0px, (100vw - 80rem) / 2 - 0.75rem)
  const arrowOffset = "max(0px, calc((100vw - 80rem) / 2 - 0.75rem))";

  return (
    // Break out of the max-w-7xl container, same trick as HeroBanner
    <div className="group/fullbleed relative w-[100vw] left-[50%] ml-[-50vw]">
      {/* Scroll container: pad content to align with body, fade edges via mask */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto gap-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{
          scrollSnapType: "x mandatory",
          // Align first card with the body content (mirrors max-w-7xl mx-auto px-4)
          paddingLeft: "max(1rem, calc((100vw - 80rem) / 2 + 1rem))",
          paddingRight: "max(1rem, calc((100vw - 80rem) / 2 + 1rem))",
          // Fade content outside the body zone into the background
          maskImage:
            "linear-gradient(to right, transparent, black max(1rem, calc((100vw - 80rem) / 2)), black calc(100% - max(1rem, calc((100vw - 80rem) / 2))), transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black max(1rem, calc((100vw - 80rem) / 2)), black calc(100% - max(1rem, calc((100vw - 80rem) / 2))), transparent)",
        }}
      >
        {children}
      </div>

      {/* Left arrow — outside the masked scroll div so it stays fully visible */}
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          style={{ left: arrowOffset }}
          className="absolute top-1/2 -translate-y-1/2 z-20 bg-zinc-800/90 hover:bg-zinc-700 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg cursor-pointer opacity-0 group-hover/fullbleed:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          style={{ right: arrowOffset }}
          className="absolute top-1/2 -translate-y-1/2 z-20 bg-zinc-800/90 hover:bg-zinc-700 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg cursor-pointer opacity-0 group-hover/fullbleed:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
