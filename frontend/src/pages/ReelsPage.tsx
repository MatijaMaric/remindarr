import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router";
import { X } from "lucide-react";
import * as api from "../api";
import type { Episode } from "../types";
import ReelsCard from "../components/ReelsCard";

interface ShowCard {
  titleId: string;
  showTitle: string;
  posterUrl: string | null;
  episodes: Episode[];
  currentIndex: number;
  caughtUp: boolean;
}

export function getFirstUnwatchedPerShow(episodes: Episode[]): ShowCard[] {
  const grouped = new Map<string, Episode[]>();
  for (const ep of episodes) {
    if (!grouped.has(ep.title_id)) grouped.set(ep.title_id, []);
    grouped.get(ep.title_id)!.push(ep);
  }

  const cards: ShowCard[] = [];
  for (const [titleId, eps] of grouped) {
    const sorted = [...eps].sort((a, b) => {
      if (a.season_number !== b.season_number) return a.season_number - b.season_number;
      return a.episode_number - b.episode_number;
    });
    cards.push({
      titleId,
      showTitle: sorted[0].show_title,
      posterUrl: sorted[0].poster_url,
      episodes: sorted,
      currentIndex: 0,
      caughtUp: false,
    });
  }

  return cards;
}

export default function ReelsPage() {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [cards, setCards] = useState<ShowCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getUpcomingEpisodes();
        setCards(getFirstUnwatchedPerShow(data.unwatched));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Loop: when sentinel at bottom becomes visible, scroll back to top
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollRef.current;
    if (!sentinel || !container || cards.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          container.scrollTo({ top: 0, behavior: "smooth" });
        }
      },
      { root: container, threshold: 0.5 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cards.length]);

  // Keyboard navigation
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (!container) return;
      const cardHeight = window.innerHeight;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        container.scrollBy({ top: cardHeight, behavior: "smooth" });
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        container.scrollBy({ top: -cardHeight, behavior: "smooth" });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const markWatched = useCallback(async (titleId: string) => {
    setCards((prev) => {
      return prev.map((card) => {
        if (card.titleId !== titleId || card.caughtUp) return card;
        const episode = card.episodes[card.currentIndex];
        if (!episode) return card;

        const nextIndex = card.currentIndex + 1;
        if (nextIndex >= card.episodes.length) {
          return { ...card, caughtUp: true };
        }
        return { ...card, currentIndex: nextIndex };
      });
    });

    // Find the episode to mark
    const card = cards.find((c) => c.titleId === titleId);
    if (!card || card.caughtUp) return;
    const episode = card.episodes[card.currentIndex];
    if (!episode) return;

    try {
      await api.watchEpisode(episode.id);
    } catch (err) {
      // Revert on failure
      setCards((prev) =>
        prev.map((c) => {
          if (c.titleId !== titleId) return c;
          if (c.caughtUp) {
            return { ...c, caughtUp: false, currentIndex: c.episodes.length - 1 };
          }
          return { ...c, currentIndex: Math.max(0, c.currentIndex - 1) };
        })
      );
      console.error("Failed to mark watched:", err);
    }
  }, [cards]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => navigate(-1)} className="text-indigo-400 hover:text-indigo-300 cursor-pointer">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-2">No unwatched episodes</p>
          <p className="text-gray-600 text-sm mb-6">You're all caught up!</p>
          <Link to="/" className="text-indigo-400 hover:text-indigo-300">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="fixed inset-0 z-[100] bg-black overflow-y-scroll snap-y snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
    >
      {/* Close button */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-4 left-4 z-[110] bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors cursor-pointer"
        aria-label="Close"
      >
        <X size={24} />
      </button>

      {/* Cards */}
      {cards.map((card, i) => (
        <ReelsCard
          key={card.titleId}
          episode={card.episodes[card.caughtUp ? card.episodes.length - 1 : card.currentIndex]}
          caughtUp={card.caughtUp}
          onMarkWatched={() => markWatched(card.titleId)}
          index={i}
          total={cards.length}
        />
      ))}

      {/* Sentinel for loop detection */}
      <div ref={sentinelRef} className="snap-start h-dvh w-full flex items-center justify-center">
        <p className="text-gray-600 text-sm">Scrolling back to start...</p>
      </div>
    </div>
  );
}
