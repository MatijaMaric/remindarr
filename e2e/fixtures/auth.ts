import type { APIRequestContext, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export interface RegisteredUser {
  username: string;
  email: string;
  password: string;
  name: string;
  userId?: string;
  token?: string;
}

export interface RegisterOptions {
  username?: string;
  email?: string;
  password?: string;
  name?: string;
}

function randSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Register a fresh user via better-auth's email signup endpoint.
 * Returns user credentials + any session cookies the server set.
 */
export async function registerUser(
  request: APIRequestContext,
  options: RegisterOptions = {}
): Promise<RegisteredUser> {
  // better-auth's default validator accepts [a-zA-Z0-9_.] only — avoid
  // dashes in the generated username.
  const username = options.username ?? `e2e_user_${randSuffix()}`;
  const email = options.email ?? `${username}@example.com`;
  const password = options.password ?? `pw_${randSuffix()}_aB1`;
  const name = options.name ?? username;

  const res = await request.post("/api/auth/sign-up/email", {
    data: { username, email, password, name },
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`sign-up failed: ${res.status()} ${text}`);
  }
  const body = await res.json().catch(() => ({}));
  const userId: string | undefined =
    body?.user?.id ?? body?.data?.user?.id ?? undefined;
  const token: string | undefined = body?.token ?? body?.data?.token;

  return { username, email, password, name, userId, token };
}

/**
 * Log in via the backend API (not UI). Useful when the UI login isn't what's
 * being tested — specs that need a browser session should call `loginUi`.
 */
export async function loginApi(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<{ token?: string }> {
  const res = await request.post("/api/auth/sign-in/username", {
    data: { username, password },
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`sign-in failed: ${res.status()} ${text}`);
  }
  const body = await res.json().catch(() => ({}));
  return { token: body?.token };
}

/**
 * Read the bootstrap admin password Remindarr writes on first boot.
 * Works with the DB_PATH convention used in e2e/globalSetup.
 */
export function readBootstrapAdminCredentials(
  dbPath = ".e2e/remindarr.sqlite"
): { username: string; password: string } {
  const abs = path.resolve(dbPath);
  const passwordFile = path.resolve(path.dirname(abs), "admin-password.txt");
  if (!fs.existsSync(passwordFile)) {
    throw new Error(
      `Admin bootstrap password file not found at ${passwordFile}. Was the backend started with a fresh DB?`
    );
  }
  const contents = fs.readFileSync(passwordFile, "utf-8");
  const match = contents.match(/Default admin password:\s*(\S+)/);
  if (!match) {
    throw new Error(`Could not parse admin password from ${passwordFile}`);
  }
  return { username: "admin", password: match[1] };
}

/**
 * Login as the bootstrap admin and return the session token.
 * The admin user is created on first backend boot with a random password
 * written to `<db-dir>/admin-password.txt`.
 */
export async function loginAdminApi(
  request: APIRequestContext,
  dbPath?: string
): Promise<{ token?: string; username: string }> {
  const { username, password } = readBootstrapAdminCredentials(dbPath);
  const { token } = await loginApi(request, username, password);
  return { token, username };
}

/**
 * Drive the LoginPage UI to sign a user in. Waits for the redirect away from
 * /login before resolving.
 */
export async function loginUi(page: Page, username: string, password: string) {
  await page.goto("/login");
  // The LoginPage hides the username form behind a toggle when OIDC/passkey is
  // configured — click through if the field isn't immediately visible.
  const usernameField = page.getByLabel("Username");
  if (!(await usernameField.isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: /sign in with username instead/i })
      .click();
  }
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}
