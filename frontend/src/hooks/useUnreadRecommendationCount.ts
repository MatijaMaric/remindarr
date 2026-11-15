import { useQuery } from "@tanstack/react-query";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";

/** Unread recommendations for the signed-in user; 0 when signed out. */
export function useUnreadRecommendationCount(): number {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["notification-count"],
    queryFn: ({ signal }) => api.getUnreadRecommendationCount(signal),
    enabled: !!user,
  });
  return user ? (data?.count ?? 0) : 0;
}
