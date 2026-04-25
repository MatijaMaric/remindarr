import { memo, useMemo, useRef, useState, useCallback, useEffect } from "react";

interface FullBleedCarouselProps {
  children: React.ReactNode;
}

// Arrow positioned just inside the body edge: max(0px, (100vw - 90rem) / 2 - 0.75rem)
const ARROW_OFFSET = "max(0px, calc((100vw - 90rem) / 2 - 0.75rem))";
// Align first card with the body content (mirrors max-w-[1440px] mx-auto px-4)
const EDGE_PAD = "max(1rem, calc((100vw - 90rem) / 2 + 1rem))";
// Width of the left/right fade zones (outside the 90rem body)
const FADE_WIDTH = "max(1rem, calc((100vw - 90rem) / 2))";

const LEFT_FADE_STYLE: React.CSSProperties = {
  width: FADE_WIDTH,
  background: "linear-gradient(to right, var(--bg-app), transparent)",
};
const RIGHT_FADE_STYLE: React.CSSProperties = {
  width: FADE_WIDTH,
  background: "linear-gradient(to left, var(--bg-app), transparent)",
};
const LEFT_ARROW_STYLE: React.CSSProperties = { left: ARROW_OFFSET };
const RIGHT_ARROW_STYLE: React.CSSProperties = { right: ARROW_OFFSET };

function FullBleedCarouselImpl({
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

  const scroll = useCallback((direction: "left" | "right") => {
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
  }, []);

  // Stable inline style for the scroll container — avoids creating a new
  // object every render that would re-mount the underlying DOM style attribute.
  const scrollContainerStyle = useMemo<React.CSSProperties>(
    () => ({
      paddingLeft: EDGE_PAD,
      paddingRight: EDGE_PAD,
      // Ensure snap points account for the padding so the first card is reachable
      scrollPaddingLeft: EDGE_PAD,
      scrollPaddingRight: EDGE_PAD,
    }),
    []
  );

  return (
    // Break out of the max-w-[1440px] container, same trick as HeroBanner
    <div className="group/fullbleed relative w-[100vw] left-[50%] ml-[-50vw]">
      {/* Scroll container: pad content to align with body */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto overflow-y-hidden gap-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={scrollContainerStyle}
      >
        {children}
      </div>

      {/* Edge fade overlays — sibling divs instead of mask-image on the scroll container
          (mask-image + overflow-x auto flickers in Firefox when siblings transition). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10"
        style={LEFT_FADE_STYLE}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10"
        style={RIGHT_FADE_STYLE}
      />

      {/* Left arrow — on top of the fade overlay so it stays fully visible */}
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          style={LEFT_ARROW_STYLE}
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
          style={RIGHT_ARROW_STYLE}
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

// React.memo with default shallow equality — biggest win arrives when callers
// memoize the `children` prop (the only prop) so we can skip re-running the
// scroll-state effects on unrelated parent re-renders.
const FullBleedCarousel = memo(FullBleedCarouselImpl);
export default FullBleedCarousel;
