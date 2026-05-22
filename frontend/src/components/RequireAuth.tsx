import { useEffect } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../context/AuthContext";

export default function RequireAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, sessionStatus, refresh } = useAuth();

  // Auto-retry once after a short delay when the session state is unknown
  // (e.g. after a service-worker update reload races the session check)
  useEffect(() => {
    if (!loading && sessionStatus === "unknown") {
      const id = setTimeout(refresh, 3000);
      return () => clearTimeout(id);
    }
  }, [loading, sessionStatus, refresh]);

  if (loading) {
    return <div className="text-center py-12 text-zinc-500">Loading...</div>;
  }

  if (sessionStatus === "unknown") {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p className="mb-4">Reconnecting…</p>
        <button type="button" onClick={refresh} className="text-sm underline">
          Try again
        </button>
      </div>
    );
  }

  if (sessionStatus === "unauthenticated" || !user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
