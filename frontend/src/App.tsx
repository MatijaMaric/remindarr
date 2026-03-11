import { Routes, Route, NavLink, Link } from "react-router";
import { useAuth } from "./context/AuthContext";
import HomePage from "./pages/HomePage";
import TrackedPage from "./pages/TrackedPage";
import CalendarPage from "./pages/CalendarPage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import RequireAuth from "./components/RequireAuth";

export default function App() {
  const { user, loading, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <h1 className="text-lg font-bold text-white tracking-tight">Remindarr</h1>
          <div className="flex gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`
              }
            >
              Browse
            </NavLink>
            {user && (
              <>
                <NavLink
                  to="/tracked"
                  className={({ isActive }) =>
                    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-indigo-600 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`
                  }
                >
                  Tracked
                </NavLink>
                <NavLink
                  to="/calendar"
                  className={({ isActive }) =>
                    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-indigo-600 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`
                  }
                >
                  Calendar
                </NavLink>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {loading ? null : user ? (
              <>
                <Link
                  to="/profile"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {user.display_name || user.username}
                </Link>
                <button
                  onClick={logout}
                  className="text-sm text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </>
            ) : (
              <NavLink
                to="/login"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Sign In
              </NavLink>
            )}
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/tracked" element={<RequireAuth><TrackedPage /></RequireAuth>} />
          <Route path="/calendar" element={<RequireAuth><CalendarPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        </Routes>
      </main>
    </div>
  );
}
