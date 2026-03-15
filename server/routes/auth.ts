import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { CONFIG } from "../config";
import {
  getUserByUsername,
  createSession,
  deleteSession,
  getSessionWithUser,
  isOidcConfigured,
  getOidcConfig,
  getUserByProviderSubject,
  createUser,
  updateUserPassword,
  updateUserAdmin,
} from "../db/repository";
import { getDiscovery, generateState, validateState, exchangeCode } from "../auth/oidc";
import type { AppEnv } from "../types";
import { logger } from "../logger";

const log = logger.child({ module: "auth" });

const app = new Hono<AppEnv>();

function setSessionCookie(c: any, token: string) {
  setCookie(c, CONFIG.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: false, // set true behind HTTPS reverse proxy
    sameSite: "Lax",
    path: "/",
    maxAge: CONFIG.SESSION_DURATION_HOURS * 3600,
  });
}

// POST /api/auth/login
app.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { username, password } = body;

  if (!username || !password) {
    return c.json({ error: "Username and password required" }, 400);
  }

  const user = getUserByUsername(username);
  if (!user || !user.password_hash) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await Bun.password.verify(password, user.password_hash);
  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = createSession(user.id);
  setSessionCookie(c, token);

  return c.json({
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      is_admin: Boolean(user.is_admin),
    },
  });
});

// POST /api/auth/logout
app.post("/logout", (c) => {
  const token = getCookie(c, CONFIG.SESSION_COOKIE_NAME);
  if (token) {
    deleteSession(token);
  }
  deleteCookie(c, CONFIG.SESSION_COOKIE_NAME, { path: "/" });
  return c.json({ success: true });
});

// GET /api/auth/me
app.get("/me", (c) => {
  const token = getCookie(c, CONFIG.SESSION_COOKIE_NAME);
  if (!token) return c.json({ user: null });

  const user = getSessionWithUser(token);
  if (!user) return c.json({ user: null });

  return c.json({ user });
});

// GET /api/auth/providers
app.get("/providers", (c) => {
  const oidcConfigured = isOidcConfigured();
  return c.json({
    local: true,
    oidc: oidcConfigured ? { name: "OpenID Connect" } : null,
  });
});

// POST /api/auth/change-password
app.post("/change-password", async (c) => {
  const token = getCookie(c, CONFIG.SESSION_COOKIE_NAME);
  if (!token) return c.json({ error: "Authentication required" }, 401);

  const user = getSessionWithUser(token);
  if (!user) return c.json({ error: "Session expired" }, 401);
  if (user.auth_provider !== "local") {
    return c.json({ error: "Password change not available for OIDC users" }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return c.json({ error: "Current and new password required" }, 400);
  }
  if (newPassword.length < 6) {
    return c.json({ error: "Password must be at least 6 characters" }, 400);
  }

  const fullUser = getUserByUsername(user.username);
  if (!fullUser) return c.json({ error: "User not found" }, 404);

  const valid = fullUser.password_hash ? await Bun.password.verify(currentPassword, fullUser.password_hash) : false;
  if (!valid) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }

  const hash = await Bun.password.hash(newPassword);
  updateUserPassword(user.id, hash);

  return c.json({ success: true });
});

// ─── OIDC ────────────────────────────────────────────────────────────────────

// GET /api/auth/oidc/authorize
app.get("/oidc/authorize", async (c) => {
  if (!isOidcConfigured()) {
    return c.json({ error: "OIDC not configured" }, 400);
  }

  try {
    const discovery = await getDiscovery();
    const { clientId, redirectUri } = getOidcConfig();
    const state = generateState();

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid profile email groups",
      state,
    });

    return c.redirect(`${discovery.authorization_endpoint}?${params}`);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /api/auth/oidc/callback
app.get("/oidc/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.redirect(`/login?error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return c.redirect("/login?error=missing_params");
  }
  if (!validateState(state)) {
    return c.redirect("/login?error=invalid_state");
  }

  try {
    const { redirectUri, adminClaim, adminValue } = getOidcConfig();
    const userInfo = await exchangeCode(code, redirectUri);

    // Determine admin status from claims
    const isAdmin = checkAdminClaim(userInfo.claims, adminClaim, adminValue);

    // Find or create user (with retry to handle concurrent OIDC logins)
    let user = getUserByProviderSubject("oidc", userInfo.sub);
    if (!user) {
      try {
        // Ensure unique username
        let username = userInfo.username;
        if (getUserByUsername(username)) {
          username = `${username}_oidc`;
        }
        createUser(username, null, userInfo.displayName || undefined, "oidc", userInfo.sub, isAdmin);
      } catch (err) {
        // Another concurrent request may have created the user — retry lookup
        user = getUserByProviderSubject("oidc", userInfo.sub);
        if (!user) throw err; // Re-throw if it's a different error
      }
      if (!user) {
        user = getUserByProviderSubject("oidc", userInfo.sub);
      }
    } else {
      // Sync admin status on every login
      updateUserAdmin(user.id, isAdmin);
    }

    const token = createSession(user!.id);
    setSessionCookie(c, token);

    return c.redirect("/");
  } catch (err: any) {
    log.error("OIDC callback error", { err });
    return c.redirect(`/login?error=${encodeURIComponent(err.message)}`);
  }
});

/** Check if OIDC claims grant admin status based on configured claim/value. */
export function checkAdminClaim(
  claims: Record<string, unknown>,
  claimName: string,
  claimValue: string
): boolean {
  if (!claimName || !claimValue) return false;

  const value = claims[claimName];
  if (value === undefined || value === null) return false;

  // Array claim (e.g. groups: ["admin", "users"])
  if (Array.isArray(value)) {
    return value.some((v) => String(v) === claimValue);
  }

  // String claim (e.g. role: "admin")
  return String(value) === claimValue;
}

export default app;
