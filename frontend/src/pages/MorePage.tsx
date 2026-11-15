import { Link, Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/card";
import UnreadBadge from "../components/UnreadBadge";
import {
  ChevronRight,
  Clapperboard,
  LayoutDashboard,
  Sparkles,
  PartyPopper,
  BarChart2,
  Settings,
  LogOut,
  Shield,
  FileText,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { useUnreadRecommendationCount } from "../hooks/useUnreadRecommendationCount";
import { HOME_DASHBOARD_STATE } from "../lib/homeView";

function MoreGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="px-5 pb-2 text-xs text-muted-foreground font-medium">
        {label}
      </div>
      <Card radius="2xl" padding="none" className="mx-4 overflow-hidden">
        {children}
      </Card>
    </div>
  );
}

function MoreRow({
  icon,
  label,
  sub,
  to,
  state,
  badge,
  onClick,
  danger,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  to?: string;
  state?: unknown;
  badge?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  isLast?: boolean;
}) {
  const inner = (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${!isLast ? "border-b border-border" : ""}`}
    >
      <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0 text-muted-foreground">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-medium ${danger ? "text-destructive" : "text-foreground"}`}
        >
          {label}
        </div>
        {sub && (
          <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
            {sub}
          </div>
        )}
      </div>
      {badge}
      {!danger && (
        <ChevronRight size={16} className="text-muted-foreground shrink-0" />
      )}
    </div>
  );

  if (to) {
    return (
      <Link to={to} state={state}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left cursor-pointer"
    >
      {inner}
    </button>
  );
}

export default function MorePage() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Same breakpoint as the tab bar (md:hidden): wider screens use the top nav.
  const hasTabBar = useIsMobile("(max-width: 767px)");
  // Under 640px the Home tab opens Reels, so More offers the dashboard instead.
  const homeTabIsReels = useIsMobile();
  const unreadCount = useUnreadRecommendationCount();

  if (!user) return null;
  if (!hasTabBar) return <Navigate to="/" replace />;

  const initials = (user.display_name ?? user.username)
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    // The shell's <main> already leaves room for the tab bar.
    <div className="pt-4">
      <h1 className="sr-only">{t("bottomNav.more")}</h1>
      {/* Profile card */}
      <div className="mx-4 mb-6">
        <Link
          to={`/user/${user.username}`}
          className="flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:bg-card/80 transition-colors"
        >
          <div className="w-12 h-12 rounded-full bg-[oklch(0.6_0.1_250)] flex items-center justify-center font-extrabold text-lg text-primary-foreground shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold truncate">
              {user.display_name ?? user.username}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              @{user.username}
            </div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground shrink-0" />
        </Link>
      </div>

      <MoreGroup label={t("more.discover")}>
        {homeTabIsReels ? (
          <MoreRow
            icon={<LayoutDashboard size={16} />}
            label={t("more.dashboard")}
            sub={t("more.dashboardSub")}
            to="/"
            state={HOME_DASHBOARD_STATE}
          />
        ) : (
          <MoreRow
            icon={<Clapperboard size={16} />}
            label={t("home.reels")}
            sub={t("more.reelsSub")}
            to="/reels"
          />
        )}
        <MoreRow
          icon={<Sparkles size={16} />}
          label={t("nav.discovery")}
          sub={t("more.discoverySub")}
          to="/discovery"
          badge={<UnreadBadge count={unreadCount} className="shrink-0" />}
        />
        <MoreRow
          icon={<BarChart2 size={16} />}
          label={t("nav.stats")}
          sub={t("more.statsSub")}
          to="/tracked?view=stats"
        />
        <MoreRow
          icon={<PartyPopper size={16} />}
          label={t("nav.wrapped")}
          sub={t("more.wrappedSub")}
          to="/wrapped"
          isLast
        />
      </MoreGroup>

      <MoreGroup label={t("more.account")}>
        <MoreRow
          icon={<Settings size={16} />}
          label={t("nav.settings")}
          to="/settings"
          isLast
        />
      </MoreGroup>

      <MoreGroup label={t("legal.kicker")}>
        <MoreRow
          icon={<Shield size={16} />}
          label={t("privacy.title")}
          to="/privacy"
        />
        <MoreRow
          icon={<FileText size={16} />}
          label={t("terms.title")}
          to="/terms"
          isLast
        />
      </MoreGroup>

      <MoreGroup label={t("more.session")}>
        <MoreRow
          icon={<LogOut size={16} />}
          label={t("nav.logout")}
          onClick={handleLogout}
          danger
          isLast
        />
      </MoreGroup>
    </div>
  );
}
