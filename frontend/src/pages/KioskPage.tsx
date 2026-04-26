import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "react-router";
import type { KioskData, KioskFidelity, KioskAiringSlot, KioskRelease, KioskQueueItem } from "../api";

const FIDELITY_VALUES: KioskFidelity[] = ["rich", "lite", "epaper"];

type KioskPalette = {
  bg: string; surface: string; surfaceAlt: string;
  text: string; dim: string; veryDim: string;
  border: string; borderSoft: string;
  accent: string; accentInk: string; chip: string;
};

const PALETTE: Record<KioskFidelity, KioskPalette> = {
  rich: {
    bg: "#09090b",
    surface: "#18181b",
    surfaceAlt: "#27272a",
    text: "#fafafa",
    dim: "#a1a1aa",
    veryDim: "#71717a",
    border: "rgba(255,255,255,0.06)",
    borderSoft: "rgba(255,255,255,0.06)",
    accent: "#fbbf24",
    accentInk: "#000",
    chip: "rgba(255,255,255,0.06)",
  },
  lite: {
    bg: "#09090b",
    surface: "#18181b",
    surfaceAlt: "#27272a",
    text: "#fafafa",
    dim: "#a1a1aa",
    veryDim: "#71717a",
    border: "rgba(255,255,255,0.06)",
    borderSoft: "rgba(255,255,255,0.06)",
    accent: "#fbbf24",
    accentInk: "#000",
    chip: "rgba(255,255,255,0.06)",
  },
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
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function airedAgo(airDate: string | null, nowMs: number): number | null {
  if (!airDate) return null;
  const ms = nowMs - Date.parse(airDate);
  return Math.max(1, Math.round(ms / 86_400_000));
}

function posterUrl(path: string | null, size: "w185" | "w780"): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `https://image.tmdb.org/t/p/${size}${path.startsWith("/") ? path : `/${path}`}`;
}

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function StripePoster({ title, tone }: { title: string; tone: "dark" | "paper" }) {
  const hue = hashHue(title);
  const bg = tone === "paper" ? `oklch(0.92 0.03 ${hue})` : `oklch(0.28 0.04 ${hue})`;
  const stripe = tone === "paper" ? `oklch(0.88 0.04 ${hue})` : `oklch(0.24 0.05 ${hue})`;
  const fg = tone === "paper" ? `oklch(0.35 0.05 ${hue})` : `oklch(0.78 0.08 ${hue})`;
  return (
    <div style={{
      width: "100%", height: "100%",
      background: `repeating-linear-gradient(135deg, ${bg} 0 14px, ${stripe} 14px 28px)`,
      display: "flex", alignItems: "flex-end", padding: 6,
      fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
      fontSize: 9, color: fg, lineHeight: 1.2,
      overflow: "hidden",
    }}>
      {title}
    </div>
  );
}

function Poster({ path, title, size, epaper }: { path: string | null; title: string; size: "w185" | "w780"; epaper: boolean }) {
  const url = posterUrl(path, size);
  if (url) {
    return <img src={url} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />;
  }
  return <StripePoster title={title} tone={epaper ? "paper" : "dark"} />;
}

// ─── Cast icon (decoration only per design note 3) ───────────────────────────
function CastIcon({ color = "#000", size = 16 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="9" rx="1" stroke={color} strokeWidth="1.5" />
      <path d="M1.5 13 q1.5 0 1.5 1.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1.5 10.5 q4 0 4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1.5 8 q6.5 0 6.5 6.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KioskHeader({ C, epaper, fidelity, household, date, clock }: {
  C: KioskPalette;
  epaper: boolean;
  fidelity: KioskFidelity;
  household: string;
  date: string;
  clock: string;
}) {
  const Mono: React.CSSProperties = { fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace" };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 24,
      padding: "20px 56px",
      borderBottom: `1px solid ${C.border}`,
      background: epaper ? C.text : "transparent",
      color: epaper ? C.bg : C.text,
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 30, height: 30, borderRadius: epaper ? 0 : 7,
          background: epaper ? C.bg : "#fbbf24", color: epaper ? C.text : "#000",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 17,
          border: epaper ? `2px solid ${C.bg}` : "none",
        }}>R</div>
        <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: -0.3 }}>Remindarr</div>
        <div style={{
          ...Mono, fontSize: 10, letterSpacing: 2,
          color: epaper ? "rgba(246,243,232,0.7)" : C.veryDim,
          padding: "3px 8px", borderRadius: epaper ? 0 : 4,
          background: epaper ? "transparent" : "rgba(255,255,255,0.04)",
          border: epaper ? "1px solid rgba(246,243,232,0.5)" : "1px solid rgba(255,255,255,0.06)",
          textTransform: "uppercase",
        }}>KIOSK · {fidelity.toUpperCase()}</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ ...Mono, fontSize: 13, color: epaper ? "rgba(246,243,232,0.85)" : C.dim, letterSpacing: 1.5 }}>
        {household}
      </div>
      <div style={{ ...Mono, fontSize: 13, color: epaper ? "rgba(246,243,232,0.7)" : C.veryDim, letterSpacing: 1.5 }}>
        {date}
      </div>
      <div style={{
        ...Mono, fontSize: 28, fontWeight: 800, letterSpacing: 1,
        color: epaper ? C.bg : "#fbbf24",
        padding: epaper ? 0 : "4px 14px",
        background: epaper ? "transparent" : "rgba(251,191,36,0.06)",
        borderRadius: 6,
        border: epaper ? "none" : "1px solid rgba(251,191,36,0.18)",
      }}>
        {clock}
      </div>
    </div>
  );
}

function HeroCard({ C, epaper, breathe, slot }: {
  C: KioskPalette;
  epaper: boolean;
  breathe: boolean;
  slot: KioskAiringSlot;
}) {
  const Mono: React.CSSProperties = { fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace" };
  const backdropUrl = posterUrl(slot.backdrop_url ?? slot.poster_url, "w780");

  return (
    <div style={{
      position: "relative", margin: "24px 56px 0",
      height: 360, borderRadius: epaper ? 0 : 14, overflow: "hidden",
      border: `${epaper ? 3 : 1}px solid ${epaper ? C.border : C.borderSoft}`,
      background: C.surface,
      animation: breathe ? "kfade 0.6s ease both" : "none",
    }}>
      {/* Backdrop */}
      {!epaper && backdropUrl && (
        <div style={{ position: "absolute", inset: 0, opacity: 0.85 }}>
          <img src={backdropUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(90deg, ${C.bg} 0%, ${C.bg}ee 35%, transparent 75%), linear-gradient(0deg, ${C.bg} 0%, transparent 55%)`,
          }} />
        </div>
      )}
      {/* E-paper hatched fill instead of poster */}
      {epaper && (
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `repeating-linear-gradient(45deg, ${C.text} 0 1px, transparent 1px 5px)`,
          opacity: 0.08,
        }} />
      )}

      <div style={{ position: "absolute", inset: 0, padding: "32px 40px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        {/* Kicker */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%", background: C.accent,
            boxShadow: epaper ? "none" : "0 0 0 4px rgba(251,191,36,0.18)",
            animation: breathe ? "kblink 1.6s ease-in-out infinite" : "none",
            flexShrink: 0,
          }} />
          <div style={{ ...Mono, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.accent }}>
            Airing now · {slot.provider ?? ""}
          </div>
        </div>

        {/* Show title */}
        <div style={{ fontSize: 80, fontWeight: 800, letterSpacing: -3, lineHeight: 0.92, marginBottom: 16, color: C.text }}>
          {slot.show_title}
        </div>

        {/* Episode info */}
        <div style={{ fontSize: 18, color: C.dim, marginBottom: 22, maxWidth: 760, lineHeight: 1.5 }}>
          S{slot.season_number}·E{slot.episode_number}
          {slot.ep_title && (
            <> · <span style={{ color: C.text, fontWeight: 600 }}>{slot.ep_title}</span></>
          )}
        </div>

        {/* Cast button — decorative only (design note 3: deferred until streaming-device registry) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            aria-hidden="true"
            style={{
              background: C.accent, color: C.accentInk,
              padding: "12px 22px", borderRadius: epaper ? 0 : 8,
              border: epaper ? `2px solid ${C.text}` : "none",
              fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center", gap: 8,
              opacity: 0.5, cursor: "default",
            }}>
            <CastIcon color={C.accentInk} /> Cast to TV
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroEmpty({ C, epaper }: { C: KioskPalette; epaper: boolean }) {
  return (
    <div style={{
      margin: "24px 56px 0", height: 360, borderRadius: epaper ? 0 : 14,
      border: `${epaper ? 3 : 1}px solid ${epaper ? C.border : C.borderSoft}`,
      background: C.surface,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace", fontSize: 13, color: C.veryDim, letterSpacing: 2, textTransform: "uppercase" }}>
        Nothing airing today
      </div>
    </div>
  );
}

function Panel({ C, epaper, children }: { C: KioskPalette; epaper: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      background: epaper ? "transparent" : C.surface,
      border: `${epaper ? 2 : 1}px solid ${epaper ? C.border : C.borderSoft}`,
      borderRadius: epaper ? 0 : 14,
      overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      {children}
    </div>
  );
}

function PanelHeader({ C, kicker, right }: { C: KioskPalette; kicker: string; right: string }) {
  const Mono: React.CSSProperties = { fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace" };
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      padding: "14px 18px", borderBottom: `1px solid ${C.borderSoft}`,
    }}>
      <div style={{ ...Mono, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.accent }}>
        {kicker}
      </div>
      <div style={{ ...Mono, fontSize: 11, color: C.veryDim, letterSpacing: 1.5 }}>
        {right}
      </div>
    </div>
  );
}

function ReleasingTodayPanel({ C, epaper, breathe, releases, nowMs }: {
  C: KioskPalette;
  epaper: boolean;
  breathe: boolean;
  releases: KioskRelease[];
  nowMs: number;
}) {
  const Mono: React.CSSProperties = { fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace" };

  return (
    <Panel C={C} epaper={epaper}>
      <PanelHeader C={C} kicker="Releasing today" right={`${releases.length} drops`} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflowY: "auto" }}>
        {releases.length === 0 ? (
          <div style={{ padding: "16px 18px", ...Mono, fontSize: 12, color: C.veryDim }}>No releases today.</div>
        ) : releases.slice(0, 8).map((r, i) => {
          const isPast = r.air_date ? Date.parse(r.air_date) < nowMs : false;
          const epCode = `S${r.season_number}·E${r.episode_number}`;
          return (
            <div key={r.id} style={{
              display: "grid", gridTemplateColumns: "70px 56px 1fr auto",
              gap: 14, alignItems: "center",
              padding: "12px 16px",
              borderBottom: i < releases.slice(0, 8).length - 1 ? `1px solid ${C.borderSoft}` : "none",
              opacity: isPast ? (epaper ? 0.55 : 0.6) : 1,
              animation: breathe ? `kfade 0.5s ease ${0.05 * i}s both` : "none",
            }}>
              <div style={{ ...Mono, fontSize: 16, fontWeight: 700, color: isPast ? C.dim : C.accent, letterSpacing: 0.5 }}>
                {r.air_date ? new Date(r.air_date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
              </div>
              <div style={{ width: 44, height: 64, borderRadius: epaper ? 0 : 4, overflow: "hidden", border: epaper ? `1px solid ${C.text}` : "none", flexShrink: 0 }}>
                <Poster path={r.poster_url} title={r.show_title} size="w185" epaper={epaper} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.15, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: C.text }}>
                  {r.show_title}
                </div>
                <div style={{ ...Mono, fontSize: 11, color: C.veryDim, letterSpacing: 0.5 }}>
                  {epCode} {r.provider && <>· <span style={{ color: C.dim }}>{r.provider}</span></>}
                </div>
              </div>
              <div style={{
                ...Mono, fontSize: 9.5, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
                padding: "3px 8px", borderRadius: epaper ? 0 : 999,
                background: r.kind === "series" ? (epaper ? C.text : "rgba(251,191,36,0.12)") : (epaper ? "transparent" : C.chip),
                color: r.kind === "series" ? (epaper ? C.bg : C.accent) : C.dim,
                border: epaper ? `1px solid ${C.text}` : "none",
                flexShrink: 0,
              }}>
                {r.kind}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function UnwatchedQueuePanel({ C, epaper, breathe, queue, nowMs }: {
  C: KioskPalette;
  epaper: boolean;
  breathe: boolean;
  queue: KioskQueueItem[];
  nowMs: number;
}) {
  const Mono: React.CSSProperties = { fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace" };

  return (
    <Panel C={C} epaper={epaper}>
      <PanelHeader C={C} kicker="Up next in your queue" right={`${queue.length} unwatched`} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflowY: "auto" }}>
        {queue.length === 0 ? (
          <div style={{ padding: "16px 18px", ...Mono, fontSize: 12, color: C.veryDim }}>All caught up!</div>
        ) : queue.slice(0, 8).map((q, i) => {
          const daysAgo = airedAgo(q.air_date, nowMs);
          const cold = daysAgo !== null && daysAgo >= 10;
          const epCode = `S${q.season_number}·E${q.episode_number}`;
          const airedText = daysAgo !== null ? `${daysAgo}d ago` : "—";
          return (
            <div key={q.id} style={{
              display: "grid", gridTemplateColumns: "56px 1fr auto auto",
              gap: 14, alignItems: "center",
              padding: "12px 16px",
              borderBottom: i < queue.slice(0, 8).length - 1 ? `1px solid ${C.borderSoft}` : "none",
              animation: breathe ? `kfade 0.5s ease ${0.05 * i}s both` : "none",
            }}>
              <div style={{ width: 44, height: 64, borderRadius: epaper ? 0 : 4, overflow: "hidden", border: epaper ? `1px solid ${C.text}` : "none", flexShrink: 0 }}>
                <Poster path={q.poster_url} title={q.show_title} size="w185" epaper={epaper} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.15, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: C.text }}>
                  {q.show_title}
                </div>
                <div style={{ fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace", fontSize: 11, color: C.veryDim, letterSpacing: 0.5 }}>
                  <span style={{ color: C.dim }}>{epCode}</span>
                  {q.ep_title && <> · {q.ep_title}</>}
                  {" · aired "}{airedText}
                </div>
              </div>
              {cold && (
                <div style={{
                  ...Mono, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
                  padding: "3px 8px", borderRadius: epaper ? 0 : 999,
                  background: epaper ? "transparent" : "rgba(255,255,255,0.04)",
                  color: C.dim,
                  border: `1px solid ${epaper ? C.text : "rgba(255,255,255,0.1)"}`,
                  flexShrink: 0,
                }}>
                  cold
                </div>
              )}
              <div style={{
                ...Mono, fontSize: 14, fontWeight: 800, color: q.left > 1 ? C.accent : C.text,
                minWidth: 30, textAlign: "right", flexShrink: 0,
              }}>
                {q.left}
                <span style={{ ...Mono, fontSize: 10, color: C.veryDim, fontWeight: 400, marginLeft: 2 }}>left</span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function KioskPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();

  const rawDisplay = searchParams.get("display");
  const fidelity: KioskFidelity = FIDELITY_VALUES.includes(rawDisplay as KioskFidelity)
    ? (rawDisplay as KioskFidelity)
    : "rich";
  const clock24 = searchParams.get("clock24") !== "false";

  const [data, setData] = useState<KioskData | null>(null);
  const [error, setError] = useState(false);
  const now = useLiveClock();
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Bypass the global auth:unauthorized event for this public endpoint
      const params = fidelity !== "rich" ? `?display=${encodeURIComponent(fidelity)}` : "";
      const res = await fetch(`/api/kiosk/${encodeURIComponent(token!)}${params}`);
      if (!res.ok) {
        setError(true);
        return;
      }
      const json = await res.json() as { data: KioskData };
      setData(json.data);
    } catch {
      setError(true);
    }
  }, [token, fidelity]);

  // Initial fetch + polling with visibility-aware pause
  useEffect(() => {
    fetchData();

    const scheduleRefresh = () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
      const interval = data?.meta.refresh_interval_seconds
        ? data.meta.refresh_interval_seconds * 1000
        : fidelity === "epaper" ? 1_800_000 : 300_000;
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

  if (error) {
    return (
      <div style={{ height: "100dvh", background: "#09090b", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 360, padding: "0 24px" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%", background: "rgba(239,68,68,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
          }}>
            <span style={{ color: "#f87171", fontSize: 24, fontWeight: 700 }}>!</span>
          </div>
          <h1 style={{ color: "#fafafa", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Kiosk unavailable</h1>
          <p style={{ color: "#a1a1aa", fontSize: 14 }}>This kiosk link is no longer valid. Ask the owner to share a new one.</p>
        </div>
      </div>
    );
  }

  const C = PALETTE[fidelity];
  const epaper = fidelity === "epaper";
  const breathe = fidelity === "rich";
  const Mono: React.CSSProperties = { fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace" };

  const household = data?.meta.household ?? "";
  const refreshSec = data?.meta.refresh_interval_seconds ?? (fidelity === "epaper" ? 1800 : 300);
  const refreshLabel = refreshSec >= 1800 ? `Auto-refreshes every ${Math.round(refreshSec / 60)} min` : "Auto-refreshes every 5 min";

  return (
    <div style={{
      width: "100vw", height: "100dvh",
      background: C.bg, color: C.text, overflow: "hidden",
      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      display: "flex", flexDirection: "column",
      WebkitFontSmoothing: epaper ? "none" : "antialiased",
      border: epaper ? `3px solid ${C.border}` : "none",
      boxSizing: "border-box",
      position: "relative",
    }}>
      {breathe && (
        <style>{`
          @keyframes kblink { 0%,100%{opacity:1} 50%{opacity:.45} }
          @keyframes kfade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        `}</style>
      )}

      <KioskHeader
        C={C}
        epaper={epaper}
        fidelity={fidelity}
        household={household}
        date={formatKioskDate(now)}
        clock={formatKioskClock(now, clock24)}
      />

      {data?.airing_now ? (
        <HeroCard C={C} epaper={epaper} breathe={breathe} slot={data.airing_now} />
      ) : (
        data !== null && <HeroEmpty C={C} epaper={epaper} />
      )}

      {/* Two-column body */}
      <div style={{
        margin: "24px 56px 0", flex: 1, minHeight: 0,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24,
        overflow: "hidden",
      }}>
        <ReleasingTodayPanel
          C={C} epaper={epaper} breathe={breathe}
          releases={data?.releasing_today ?? []}
          nowMs={now.getTime()}
        />
        <UnwatchedQueuePanel
          C={C} epaper={epaper} breathe={breathe}
          queue={data?.unwatched_queue ?? []}
          nowMs={now.getTime()}
        />
      </div>

      {/* Footer */}
      <div style={{
        margin: "20px 56px 18px",
        display: "flex", alignItems: "center", gap: 28,
        ...Mono, fontSize: 11, color: C.veryDim, letterSpacing: 2, textTransform: "uppercase",
        paddingTop: 14, borderTop: `1px solid ${C.borderSoft}`,
        flexShrink: 0,
      }}>
        <span>{refreshLabel}</span>
        <span style={{ flex: 1 }} />
        <span>read-only · token {token?.slice(0, 4) ?? "—"}</span>
        <span>{typeof window !== "undefined" ? window.location.hostname : ""}/kiosk</span>
      </div>
    </div>
  );
}
