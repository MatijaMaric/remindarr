import { lazy, Suspense } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { wantsDashboard } from "../lib/homeView";
import ErrorBoundary from "../components/ErrorBoundary";

const HomePage = lazy(() => import("../pages/HomePage"));

export default function HomeRoute() {
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();
  if (loading) return null;
  // Reels is the default Home view on phones. The dashboard stays reachable
  // through links that ask for it explicitly (see lib/homeView.ts).
  if (user && isMobile && !wantsDashboard(location.state)) {
    return <Navigate to="/reels" replace />;
  }
  return (
    <ErrorBoundary variant="inline">
      <Suspense
        fallback={
          <div className="text-center py-12 text-muted-foreground">
            Loading...
          </div>
        }
      >
        <HomePage />
      </Suspense>
    </ErrorBoundary>
  );
}
