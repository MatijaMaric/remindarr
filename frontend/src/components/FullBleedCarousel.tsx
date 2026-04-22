import { useRef, useState, useCallback, useEffect } from "react";

interface FullBleedCarouselProps {
  children: React.ReactNode;
}

export default function FullBleedCarousel({
  children,
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
    el.scrollLeft = 0;
    updateScrollButtons();
    // Enable snap AFTER position is set so mandatory snap doesn't override it
    const rafId = requestAnimationFrame(() => {
      el.style.scrollSnapType = "x mandatory";
    });
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    const observer = new ResizeObserver(updateScrollButtons);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener("scroll", updateScrollButtons);
      observer.disconnect();
    };
  }, [updateScrollButtons]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const amount = el.clientWidth - padLeft - padRight;
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  // Arrow positioned just inside the body edge: max(0px, (100vw - 80rem) / 2 - 0.75rem)
  const arrowOffset = "max(0px, calc((100vw - 80rem) / 2 - 0.75rem))";
  // Align first card with the body content (mirrors max-w-7xl mx-auto px-4)
  const edgePad = "max(1rem, calc((100vw - 80rem) / 2 + 1rem))";
  // Width of the left/right fade zones (outside the 80rem body)
  const fadeWidth = "max(1rem, calc((100vw - 80rem) / 2))";

  return (
    // Break out of the max-w-7xl container, same trick as HeroBanner
    <div className="group/fullbleed relative w-[100vw] left-[50%] ml-[-50vw]">
      {/* Scroll container: pad content to align with body */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto overflow-y-hidden gap-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{
          paddingLeft: edgePad,
          paddingRight: edgePad,
          // Ensure snap points account for the padding so the first card is reachable
          scrollPaddingLeft: edgePad,
          scrollPaddingRight: edgePad,
        }}
      >
        {children}
      </div>

      {/* Edge fade overlays — sibling divs instead of mask-image on the scroll container
          (mask-image + overflow-x auto flickers in Firefox when siblings transition). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10"
        style={{
          width: fadeWidth,
          background: "linear-gradient(to right, var(--bg-app), transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10"
        style={{
          width: fadeWidth,
          background: "linear-gradient(to left, var(--bg-app), transparent)",
        }}
      />

      {/* Left arrow — on top of the fade overlay so it stays fully visible */}
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
