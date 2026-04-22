import { lazy, Suspense } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import ErrorBoundary from "../components/ErrorBoundary";

const HomePage = lazy(() => import("../pages/HomePage"));

export default function HomeRoute() {
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  if (loading) return null;
  if (user && isMobile) return <Navigate to="/reels" replace />;
  return (
    <ErrorBoundary variant="inline">
      <Suspense fallback={<div className="text-center py-12 text-zinc-500">Loading...</div>}>
        <HomePage />
      </Suspense>
    </ErrorBoundary>
  );
}
