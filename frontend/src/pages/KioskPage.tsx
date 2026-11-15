import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "react-router";
import type {
  KioskData,
  KioskFidelity,
  KioskRelease,
  KioskQueueItem,
} from "../api";
import {
  posterUrl as tmdbPosterUrl,
  backdropUrl as tmdbBackdropUrl,
} from "../lib/tmdb-images";

const FIDELITY_VALUES: KioskFidelity[] = ["rich", "lite", "epaper"];

const Mono: React.CSSProperties = {
  fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
};

type KioskPalette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  dim: string;
  veryDim: string;
  border: string;
  borderSoft: string;
  accent: string;
  accentInk: string;
  chip: string;
};

// `rich` and `lite` share the same dark palette; the visual difference between
// them lives in animation flags at the render site (e.g. `breathe`), not colors.
const DARK_PALETTE: KioskPalette = {
  bg: "#09090b",
  surface: "#18181b",
  surfaceAlt: "#27272a",
  text: "#fafafa",
  dim: "#a1a1aa",
  veryDim: "#8c8c99",
  border: "rgba(255,255,255,0.06)",
  borderSoft: "rgba(255,255,255,0.06)",
  accent: "#fbbf24",
  accentInk: "#000",
  chip: "rgba(255,255,255,0.06)",
};

const PALETTE: Record<KioskFidelity, KioskPalette> = {
  rich: DARK_PALETTE,
  lite: DARK_PALETTE,
  epaper: {
    bg: "#f6f3e8",
    surface: "#f6f3e8",
    surfaceAlt: "#ecead7",
    text: "#1a1916",
    dim: "#6a665c",
    veryDim: "#9b978a",
    border: "#1a1916",
    borderSoft: "rgba(26,25,22,0.18)",
    accent: "#1a1916",
    accentInk: "#f6f3e8",
    chip: "#1a1916",
  },
};

// Rows that fit in a panel on a 1080p screen; the kiosk cannot scroll.
const PANEL_ROWS = 8;

// The token is wrong, revoked or malformed: retrying will not help.
const INVALID_LINK_STATUSES = new Set([400, 401, 404]);

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatKioskClock(d: Date, clock24: boolean): string {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !clock24,
  });
}

function formatKioskDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * Whole calendar days between a date-only air date (YYYY-MM-DD) and today in
 * the viewer's timezone. Date.parse would read the string as UTC midnight and
 * shift it by the timezone offset.
 */
function airedDaysAgo(airDate: string | null, now: Date): number | null {
  if (!airDate) return null;
  const [y, m, d] = airDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const aired = new Date(y, m - 1, d);
  return Math.round((today.getTime() - aired.getTime()) / 86_400_000);
}

function airedLabel(days: number | null): string {
  if (days === null) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function kioskImageUrl(
  path: string | null,
  size: "w185" | "w780",
): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (size === "w780") return tmdbBackdropUrl(normalizedPath, "w780");
  return tmdbPosterUrl(normalizedPath, "w185");
}

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function StripePoster({
  title,
  tone,
}: {
  title: string;
  tone: "dark" | "paper";
}) {
  const hue = hashHue(title);
  const bg =
    tone === "paper" ? `oklch(0.92 0.03 ${hue})` : `oklch(0.28 0.04 ${hue})`;
  const stripe =
    tone === "paper" ? `oklch(0.88 0.04 ${hue})` : `oklch(0.24 0.05 ${hue})`;
  const fg =
    tone === "paper" ? `oklch(0.35 0.05 ${hue})` : `oklch(0.78 0.08 ${hue})`;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: `repeating-linear-gradient(135deg, ${bg} 0 14px, ${stripe} 14px 28px)`,
        display: "flex",
        alignItems: "flex-end",
        padding: 6,
        fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
        fontSize: 9,
        color: fg,
        lineHeight: 1.2,
        overflow: "hidden",
      }}
    >
      {title}
    </div>
  );
}

function Poster({
  path,
  title,
  size,
  epaper,
}: {
  path: string | null;
  title: string;
  size: "w185" | "w780";
  epaper: boolean;
}) {
  const url = kioskImageUrl(path, size);
  if (url) {
    return (
      <img
        src={url}
        alt={title}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        loading="lazy"
      />
    );
  }
  return <StripePoster title={title} tone={epaper ? "paper" : "dark"} />;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KioskHeader({
  C,
  epaper,
  household,
  date,
  clock,
}: {
  C: KioskPalette;
  epaper: boolean;
  household: string;
  date: string;
  clock: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "20px 56px",
        borderBottom: `1px solid ${C.border}`,
        background: epaper ? C.text : "transparent",
        color: epaper ? C.bg : C.text,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: epaper ? 0 : 7,
            background: epaper ? C.bg : "#fbbf24",
            color: epaper ? C.text : "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 17,
            border: epaper ? `2px solid ${C.bg}` : "none",
          }}
        >
          R
        </div>
        <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: -0.3 }}>
          Remindarr
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          ...Mono,
          fontSize: 13,
          color: epaper ? "rgba(246,243,232,0.85)" : C.dim,
          letterSpacing: 1.5,
        }}
      >
        {household}
      </div>
      <div
        style={{
          ...Mono,
          fontSize: 13,
          color: epaper ? "rgba(246,243,232,0.7)" : C.veryDim,
          letterSpacing: 1.5,
        }}
      >
        {date}
      </div>
      <div
        style={{
          ...Mono,
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: 1,
          color: epaper ? C.bg : "#fbbf24",
          padding: epaper ? 0 : "4px 14px",
          background: epaper ? "transparent" : "rgba(251,191,36,0.06)",
          borderRadius: 6,
          border: epaper ? "none" : "1px solid rgba(251,191,36,0.18)",
        }}
      >
        {clock}
      </div>
    </div>
  );
}

type FeaturedItem = {
  id: number;
  show_title: string;
  season_number: number;
  episode_number: number;
  ep_title: string | null;
  poster_url: string | null;
  backdrop_url?: string | null;
  provider: string | null;
};

function Hero({
  C,
  epaper,
  breathe,
  item,
  kicker,
  pulse,
}: {
  C: KioskPalette;
  epaper: boolean;
  breathe: boolean;
  item: FeaturedItem;
  kicker: string;
  /** Blink the kicker dot — only for something new today. */
  pulse: boolean;
}) {
  const backdropSrc = kioskImageUrl(
    item.backdrop_url ?? item.poster_url,
    "w780",
  );

  return (
    <div
      style={{
        position: "relative",
        margin: "24px 56px 0",
        height: 360,
        borderRadius: epaper ? 0 : 14,
        overflow: "hidden",
        border: `${epaper ? 3 : 1}px solid ${epaper ? C.border : C.borderSoft}`,
        background: C.surface,
        animation: breathe ? "kfade 0.6s ease both" : "none",
      }}
    >
      {/* Backdrop */}
      {!epaper && backdropSrc && (
        <div style={{ position: "absolute", inset: 0, opacity: 0.85 }}>
          <img
            src={backdropSrc}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(90deg, ${C.bg} 0%, ${C.bg}ee 35%, transparent 75%), linear-gradient(0deg, ${C.bg} 0%, transparent 55%)`,
            }}
          />
        </div>
      )}
      {/* E-paper hatched fill instead of the backdrop */}
      {epaper && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `repeating-linear-gradient(45deg, ${C.text} 0 1px, transparent 1px 5px)`,
            opacity: 0.08,
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: "32px 40px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: C.accent,
              boxShadow: epaper ? "none" : "0 0 0 4px rgba(251,191,36,0.18)",
              animation:
                breathe && pulse ? "kblink 1.6s ease-in-out infinite" : "none",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              ...Mono,
              fontSize: 11,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: C.accent,
            }}
          >
            {kicker}
            {item.provider ? ` · ${item.provider}` : ""}
          </div>
        </div>

        <div
          style={{
            fontSize: 80,
            fontWeight: 800,
            letterSpacing: -3,
            lineHeight: 0.92,
            marginBottom: 16,
            color: C.text,
          }}
        >
          {item.show_title}
        </div>

        <div
          style={{
            fontSize: 18,
            color: C.dim,
            maxWidth: 760,
            lineHeight: 1.5,
          }}
        >
          S{item.season_number}·E{item.episode_number}
          {item.ep_title && (
            <>
              {" "}
              ·{" "}
              <span style={{ color: C.text, fontWeight: 600 }}>
                {item.ep_title}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HeroEmpty({ C, epaper }: { C: KioskPalette; epaper: boolean }) {
  return (
    <div
      style={{
        margin: "24px 56px 0",
        height: 360,
        borderRadius: epaper ? 0 : 14,
        border: `${epaper ? 3 : 1}px solid ${epaper ? C.border : C.borderSoft}`,
        background: C.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
          fontSize: 13,
          color: C.veryDim,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        Nothing on the slate today
      </div>
    </div>
  );
}

function Panel({
  C,
  epaper,
  children,
}: {
  C: KioskPalette;
  epaper: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: epaper ? "transparent" : C.surface,
        border: `${epaper ? 2 : 1}px solid ${epaper ? C.border : C.borderSoft}`,
        borderRadius: epaper ? 0 : 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  C,
  kicker,
  right,
}: {
  C: KioskPalette;
  kicker: string;
  right: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "14px 18px",
        borderBottom: `1px solid ${C.borderSoft}`,
      }}
    >
      <div
        style={{
          ...Mono,
          fontSize: 11,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: C.accent,
        }}
      >
        {kicker}
      </div>
      <div
        style={{ ...Mono, fontSize: 11, color: C.veryDim, letterSpacing: 1.5 }}
      >
        {right}
      </div>
    </div>
  );
}

function ReleasingTodayPanel({
  C,
  epaper,
  breathe,
  releases,
  total,
}: {
  C: KioskPalette;
  epaper: boolean;
  breathe: boolean;
  releases: KioskRelease[];
  /** All of today's episodes, including the one in the hero. */
  total: number;
}) {
  return (
    <Panel C={C} epaper={epaper}>
      <PanelHeader C={C} kicker="New today" right={plural(total, "episode")} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {releases.map((r, i) => (
          <div
            key={r.id}
            style={{
              display: "grid",
              gridTemplateColumns: "56px 1fr auto",
              gap: 14,
              alignItems: "center",
              padding: "12px 16px",
              borderBottom:
                i < releases.length - 1 ? `1px solid ${C.borderSoft}` : "none",
              animation: breathe ? `kfade 0.5s ease ${0.05 * i}s both` : "none",
            }}
          >
            <div
              style={{
                width: 44,
                height: 64,
                borderRadius: epaper ? 0 : 4,
                overflow: "hidden",
                border: epaper ? `1px solid ${C.text}` : "none",
                flexShrink: 0,
              }}
            >
              <Poster
                path={r.poster_url}
                title={r.show_title}
                size="w185"
                epaper={epaper}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  lineHeight: 1.15,
                  marginBottom: 3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: C.text,
                }}
              >
                {r.show_title}
              </div>
              <div
                style={{
                  ...Mono,
                  fontSize: 11,
                  color: C.veryDim,
                  letterSpacing: 0.5,
                }}
              >
                S{r.season_number}·E{r.episode_number}{" "}
                {r.provider && (
                  <>
                    · <span style={{ color: C.dim }}>{r.provider}</span>
                  </>
                )}
              </div>
            </div>
            {r.kind === "premiere" ? (
              <div
                style={{
                  ...Mono,
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: epaper ? 0 : 999,
                  background: epaper ? C.text : "rgba(251,191,36,0.12)",
                  color: epaper ? C.bg : C.accent,
                  border: epaper ? `1px solid ${C.text}` : "none",
                  flexShrink: 0,
                }}
              >
                premiere
              </div>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function UnwatchedQueuePanel({
  C,
  epaper,
  breathe,
  queue,
  total,
  now,
}: {
  C: KioskPalette;
  epaper: boolean;
  breathe: boolean;
  queue: KioskQueueItem[];
  /** Shows with an unwatched episode, including any in the hero. */
  total: number;
  now: Date;
}) {
  return (
    <Panel C={C} epaper={epaper}>
      <PanelHeader
        C={C}
        kicker="Up next in your queue"
        right={plural(total, "show")}
      />
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {queue.map((q, i) => {
          const daysAgo = airedDaysAgo(q.air_date, now);
          const cold = daysAgo !== null && daysAgo >= 10;
          return (
            <div
              key={q.id}
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr auto auto",
                gap: 14,
                alignItems: "center",
                padding: "12px 16px",
                borderBottom:
                  i < queue.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                animation: breathe
                  ? `kfade 0.5s ease ${0.05 * i}s both`
                  : "none",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 64,
                  borderRadius: epaper ? 0 : 4,
                  overflow: "hidden",
                  border: epaper ? `1px solid ${C.text}` : "none",
                  flexShrink: 0,
                }}
              >
                <Poster
                  path={q.poster_url}
                  title={q.show_title}
                  size="w185"
                  epaper={epaper}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    marginBottom: 3,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: C.text,
                  }}
                >
                  {q.show_title}
                </div>
                <div
                  style={{
                    ...Mono,
                    fontSize: 11,
                    color: C.veryDim,
                    letterSpacing: 0.5,
                  }}
                >
                  <span style={{ color: C.dim }}>
                    S{q.season_number}·E{q.episode_number}
                  </span>
                  {q.ep_title && <> · {q.ep_title}</>}
                  {" · aired "}
                  {airedLabel(daysAgo)}
                </div>
              </div>
              {cold ? (
                <div
                  style={{
                    ...Mono,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    padding: "3px 8px",
                    borderRadius: epaper ? 0 : 999,
                    background: epaper
                      ? "transparent"
                      : "rgba(255,255,255,0.04)",
                    color: C.dim,
                    border: `1px solid ${epaper ? C.text : "rgba(255,255,255,0.1)"}`,
                    flexShrink: 0,
                  }}
                >
                  cold
                </div>
              ) : (
                <span />
              )}
              <div
                style={{
                  ...Mono,
                  fontSize: 14,
                  fontWeight: 800,
                  color: q.left > 1 ? C.accent : C.text,
                  minWidth: 30,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {q.left}
                <span
                  style={{
                    ...Mono,
                    fontSize: 10,
                    color: C.veryDim,
                    fontWeight: 400,
                    marginLeft: 2,
                  }}
                >
                  left
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

/**
 * One item leads the screen and is not repeated below it: today's first
 * unwatched episode, else today's first episode, else the top of the queue.
 */
function pickHero(data: KioskData): {
  item: FeaturedItem;
  kicker: string;
  pulse: boolean;
} | null {
  const today =
    data.releasing_today.find((r) => !r.is_watched) ?? data.releasing_today[0];
  if (today) return { item: today, kicker: "New today", pulse: true };
  const next = data.unwatched_queue[0];
  if (next) return { item: next, kicker: "Up next", pulse: false };
  return null;
}

export default function KioskPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();

  const rawDisplay = searchParams.get("display");
  const fidelity: KioskFidelity = FIDELITY_VALUES.includes(
    rawDisplay as KioskFidelity,
  )
    ? (rawDisplay as KioskFidelity)
    : "rich";
  const clock24 = searchParams.get("clock24") !== "false";

  const [data, setData] = useState<KioskData | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);
  const now = useLiveClock();
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Bypass the global auth:unauthorized event for this public endpoint
      const params =
        fidelity !== "rich" ? `?display=${encodeURIComponent(fidelity)}` : "";
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch(
        `/api/kiosk/${encodeURIComponent(token!)}${params}`,
        {
          headers: { "X-Timezone": tz },
        },
      );
      if (INVALID_LINK_STATUSES.has(res.status)) {
        setInvalidLink(true);
        return;
      }
      // Anything else (5xx, rate limit) is transient on a wall display:
      // keep the last good data and try again on the next poll.
      if (!res.ok) return;
      const json = (await res.json()) as KioskData;
      setData(json);
      setInvalidLink(false);
    } catch {
      // Network blip — same as a transient server error.
    }
  }, [token, fidelity]);

  // Initial fetch + polling with visibility-aware pause
  useEffect(() => {
    fetchData();

    const scheduleRefresh = () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
      const interval = data?.meta.refresh_interval_seconds
        ? data.meta.refresh_interval_seconds * 1000
        : fidelity === "epaper"
          ? 1_800_000
          : 300_000;
      refreshRef.current = setInterval(() => {
        if (!document.hidden) fetchData();
      }, interval);
    };

    scheduleRefresh();

    const onVisibility = () => {
      if (!document.hidden) fetchData();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  if (invalidLink) {
    return (
      <div
        style={{
          height: "100dvh",
          background: "#09090b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 360, padding: "0 24px" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(239,68,68,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <span style={{ color: "#f87171", fontSize: 24, fontWeight: 700 }}>
              !
            </span>
          </div>
          <h1
            style={{
              color: "#fafafa",
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Kiosk unavailable
          </h1>
          <p style={{ color: "#a1a1aa", fontSize: 14 }}>
            This kiosk link is no longer valid. Ask the owner to share a new
            one.
          </p>
        </div>
      </div>
    );
  }

  const C = PALETTE[fidelity];
  const epaper = fidelity === "epaper";
  const breathe = fidelity === "rich";

  const household = data?.meta.household ?? "";
  const refreshSec =
    data?.meta.refresh_interval_seconds ?? (fidelity === "epaper" ? 1800 : 300);

  const hero = data ? pickHero(data) : null;
  const heroId = hero?.item.id;
  const releases = (data?.releasing_today ?? [])
    .filter((r) => r.id !== heroId)
    .slice(0, PANEL_ROWS);
  const queue = (data?.unwatched_queue ?? [])
    .filter((q) => q.id !== heroId)
    .slice(0, PANEL_ROWS);

  return (
    <div
      style={{
        width: "100vw",
        height: "100dvh",
        background: C.bg,
        color: C.text,
        overflow: "hidden",
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        display: "flex",
        flexDirection: "column",
        WebkitFontSmoothing: epaper ? "none" : "antialiased",
        border: epaper ? `3px solid ${C.border}` : "none",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {breathe && (
        <style>{`
          @keyframes kblink { 0%,100%{opacity:1} 50%{opacity:.45} }
          @keyframes kfade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        `}</style>
      )}

      <KioskHeader
        C={C}
        epaper={epaper}
        household={household}
        date={formatKioskDate(now)}
        clock={formatKioskClock(now, clock24)}
      />

      {hero ? (
        <Hero
          C={C}
          epaper={epaper}
          breathe={breathe}
          item={hero.item}
          kicker={hero.kicker}
          pulse={hero.pulse}
        />
      ) : (
        data !== null && <HeroEmpty C={C} epaper={epaper} />
      )}

      {/* Panels render only when they have rows the hero does not already show */}
      <div
        className="kiosk-body-grid"
        style={{
          margin: "24px 56px 0",
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(300px, 100%), 1fr))",
          alignContent: "start",
          gap: 24,
          overflow: "hidden",
        }}
      >
        {releases.length > 0 && (
          <ReleasingTodayPanel
            C={C}
            epaper={epaper}
            breathe={breathe}
            releases={releases}
            total={data?.releasing_today.length ?? 0}
          />
        )}
        {queue.length > 0 && (
          <UnwatchedQueuePanel
            C={C}
            epaper={epaper}
            breathe={breathe}
            queue={queue}
            total={data?.queue_total ?? queue.length}
            now={now}
          />
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          margin: "20px 56px 18px",
          display: "flex",
          alignItems: "center",
          gap: 28,
          ...Mono,
          fontSize: 11,
          color: C.veryDim,
          letterSpacing: 2,
          textTransform: "uppercase",
          paddingTop: 14,
          borderTop: `1px solid ${C.borderSoft}`,
          flexShrink: 0,
        }}
      >
        <span>Auto-refreshes every {Math.round(refreshSec / 60)} min</span>
      </div>
    </div>
  );
}
