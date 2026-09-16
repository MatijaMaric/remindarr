import { lazy, Suspense } from "react";
import { useAuth } from "../context/AuthContext";
import ErrorBoundary from "../components/ErrorBoundary";

const HomePage = lazy(() => import("../pages/HomePage"));

export default function HomeRoute() {
  const { loading } = useAuth();
  if (loading) return null;
  return (
    <ErrorBoundary variant="inline">
      <Suspense
        fallback={
          <div className="text-center py-12 text-zinc-500">Loading...</div>
        }
      >
        <HomePage />
      </Suspense>
    </ErrorBoundary>
  );
}
