import { createUser, createSession } from "../db/repository";

/**
 * Create a test user and session, returning a cookie header string
 * for use with Hono's app.request().
 */
export async function createTestSession(opts?: {
  username?: string;
  isAdmin?: boolean;
  authProvider?: string;
  providerSubject?: string;
}): Promise<{ userId: string; token: string; cookieHeader: string }> {
  const username = opts?.username ?? "testuser";
  const hash = await Bun.password.hash("password123");
  const userId = await createUser(
    username,
    hash,
    username,
    opts?.authProvider ?? "local",
    opts?.providerSubject,
    opts?.isAdmin ?? false
  );
  const token = await createSession(userId);

  // better-auth uses "better-auth.session_token" cookie name
  const cookieHeader = `better-auth.session_token=${token}`;
  return { userId, token, cookieHeader };
}
