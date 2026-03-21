import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";
import { adminClient } from "better-auth/client/plugins";

function getBaseURL(): string {
  if (typeof window !== "undefined") {
    const origin = window.location?.origin;
    if (origin && origin !== "null") return origin;
  }
  return "http://localhost:3000";
}

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  basePath: "/api/auth",
  plugins: [usernameClient(), adminClient()],
});
