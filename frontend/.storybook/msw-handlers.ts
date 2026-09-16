import { http, HttpResponse } from "msw";
import type { RatingValue, TitleRatingResponse } from "../src/types";

export function createMswHandlers() {
  const ratings = new Map<string, RatingValue | null>([["rated", "LIKE"]]);
  return [
    http.get("/api/auth/get-session", () =>
      HttpResponse.json({
        session: { id: "storybook-session", userId: "storybook-user" },
        user: {
          id: "storybook-user",
          username: "alex",
          name: "Alex",
          role: "user",
        },
      }),
    ),
    http.get("/api/auth/custom/providers", () =>
      HttpResponse.json({ local: true, oidc: null, passkey: false }),
    ),
    http.get("/api/user/settings/subscriptions", () =>
      HttpResponse.json({ providerIds: [8], onlyMine: false }),
    ),
    http.get("/api/ratings/:titleId", ({ params }) => {
      const rating = ratings.get(String(params.titleId)) ?? null;
      const response: TitleRatingResponse = {
        user_rating: rating,
        aggregated: { HATE: 0, DISLIKE: 1, LIKE: 3, LOVE: 2 },
        friends_ratings:
          params.titleId === "friends"
            ? [
                {
                  user: {
                    id: "alice",
                    username: "alice",
                    display_name: "Alice",
                    image: null,
                  },
                  rating: "LIKE",
                },
                {
                  user: {
                    id: "sam",
                    username: "sam",
                    display_name: "Sam",
                    image: null,
                  },
                  rating: "LOVE",
                },
              ]
            : [],
      };
      if (rating) response.aggregated[rating]++;
      return HttpResponse.json(response);
    }),
    http.post("/api/ratings/:titleId", async ({ params, request }) => {
      const { rating } = (await request.json()) as { rating: RatingValue };
      ratings.set(String(params.titleId), rating);
      return HttpResponse.json({ success: true });
    }),
    http.delete("/api/ratings/:titleId", ({ params }) => {
      ratings.set(String(params.titleId), null);
      return HttpResponse.json({ success: true });
    }),
    http.patch("/api/track/:titleId/notification", () =>
      HttpResponse.json({ success: true }),
    ),
    http.patch("/api/track/:titleId/snooze", () =>
      HttpResponse.json({ success: true }),
    ),
    http.patch("/api/track/:titleId/remind-on-release", () =>
      HttpResponse.json({
        success: true,
        scheduledFor: "2026-10-01T00:00:00Z",
      }),
    ),
  ];
}
