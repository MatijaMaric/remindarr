import { Link, useNavigate } from "react-router";
import { ChevronRight, Sparkles, BarChart2, User, Settings, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";

function MoreGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="px-5 pb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">
        {label}
      </div>
      <div className="mx-4 bg-zinc-900 border border-white/[0.05] rounded-2xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function MoreRow({
  icon,
  label,
  sub,
  to,
  onClick,
  danger,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
  isLast?: boolean;
}) {
  const inner = (
    <div className={`flex items-center gap-3 px-4 py-3.5 ${!isLast ? "border-b border-white/[0.04]" : ""}`}>
      <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 text-zinc-400">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${danger ? "text-red-400" : "text-zinc-100"}`}>
          {label}
        </div>
        {sub && (
          <div className="font-mono text-[11px] text-zinc-500 mt-0.5">{sub}</div>
        )}
      </div>
      {!danger && (
        <ChevronRight size={16} className="text-zinc-600 shrink-0" />
      )}
    </div>
  );

  if (to) {
    return <Link to={to}>{inner}</Link>;
  }
  return (
    <button type="button" onClick={onClick} className="w-full text-left cursor-pointer">
      {inner}
    </button>
  );
}

export default function MorePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

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
    <div className="pb-32 pt-4">
      {/* Profile card */}
      <div className="mx-4 mb-6">
        <Link
          to={`/user/${user.username}`}
          className="flex items-center gap-3 bg-zinc-900 border border-white/[0.05] rounded-2xl p-4 hover:bg-zinc-900/80 transition-colors"
        >
          <div className="w-12 h-12 rounded-full bg-[oklch(0.6_0.1_250)] flex items-center justify-center font-extrabold text-lg text-black shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold truncate">
              {user.display_name ?? user.username}
            </div>
            <div className="font-mono text-[11px] text-zinc-500">
              @{user.username}
            </div>
          </div>
          <ChevronRight size={16} className="text-zinc-600 shrink-0" />
        </Link>
      </div>

      {/* Discover */}
      <MoreGroup label="Discover">
        <MoreRow
          icon={<Sparkles size={16} />}
          label="Discovery"
          sub="Recommendations for you"
          to="/discovery"
        />
        <MoreRow
          icon={<BarChart2 size={16} />}
          label="Stats"
          sub="Your watch history"
          to="/stats"
          isLast
        />
      </MoreGroup>

      {/* Account */}
      <MoreGroup label="Account">
        <MoreRow
          icon={<User size={16} />}
          label="Profile"
          to={`/user/${user.username}`}
        />
        <MoreRow
          icon={<Settings size={16} />}
          label="Settings"
          to="/settings"
          isLast
        />
      </MoreGroup>

      {/* Session */}
      <MoreGroup label="Session">
        <MoreRow
          icon={<LogOut size={16} />}
          label="Sign out"
          onClick={handleLogout}
          danger
          isLast
        />
      </MoreGroup>
    </div>
  );
}
