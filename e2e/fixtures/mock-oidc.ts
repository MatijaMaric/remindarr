/**
 * Minimal mock OIDC provider used by e2e tests.
 *
 * Exposes:
 *   GET  /.well-known/openid-configuration
 *   GET  /authorize      — immediately 302s back to the redirect_uri with a code
 *   POST /token          — issues access_token + id_token (RS256 JWT)
 *   GET  /userinfo       — returns the claims for the last-issued token
 *   GET  /jwks           — JWKS with the public half of the signing key
 *
 * Playwright runs this under plain Node in globalSetup, so it uses node:http
 * and node:url rather than Bun-specific APIs.
 */
import http from "node:http";
import { URL } from "node:url";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

export interface MockOidcServer {
  url: string;
  port: number;
  stop: () => Promise<void>;
  /** The most-recently-issued authorization code (for assertions). */
  readonly lastCode: string | null;
}

export interface MockOidcOptions {
  /** sub claim returned in id_token / userinfo */
  sub?: string;
  /** preferred_username / name */
  username?: string;
  email?: string;
  /** Extra claims merged into id_token + userinfo */
  extraClaims?: Record<string, unknown>;
  port?: number;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parseForm(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  params.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Length", Buffer.byteLength(body).toString());
  res.end(body);
}

export async function startMockOidcServer(
  options: MockOidcOptions = {}
): Promise<MockOidcServer> {
  const sub = options.sub ?? "oidc-user-1";
  const username = options.username ?? "oidcuser";
  const email = options.email ?? "oidcuser@example.com";
  const extraClaims = options.extraClaims ?? {};
  const port = options.port ?? 4321;

  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  const kid = "mock-oidc-key-1";
  publicJwk.kid = kid;
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  const issuer = `http://127.0.0.1:${port}`;
  const state: { lastCode: string | null; lastRedirectUri: string | null } = {
    lastCode: null,
    lastRedirectUri: null,
  };

  const buildClaims = () => ({
    sub,
    name: username,
    preferred_username: username,
    email,
    email_verified: true,
    ...extraClaims,
  });

  const mintIdToken = async (audience: string): Promise<string> => {
    return new SignJWT(buildClaims())
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", issuer);
      const pathname = url.pathname;

      if (req.method === "GET" && pathname === "/.well-known/openid-configuration") {
        return sendJson(res, 200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          userinfo_endpoint: `${issuer}/userinfo`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          scopes_supported: ["openid", "profile", "email", "groups"],
          token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
          claims_supported: ["sub", "name", "preferred_username", "email", "email_verified", "groups"],
        });
      }

      if (req.method === "GET" && pathname === "/jwks") {
        return sendJson(res, 200, { keys: [publicJwk] });
      }

      if (req.method === "GET" && pathname === "/authorize") {
        const redirectUri = url.searchParams.get("redirect_uri");
        const authState = url.searchParams.get("state") ?? "";
        if (!redirectUri) {
          res.statusCode = 400;
          res.end("Missing redirect_uri");
          return;
        }
        const code = `mock-code-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        state.lastCode = code;
        state.lastRedirectUri = redirectUri;
        const redirect = new URL(redirectUri);
        redirect.searchParams.set("code", code);
        if (authState) redirect.searchParams.set("state", authState);
        res.statusCode = 302;
        res.setHeader("Location", redirect.toString());
        res.end();
        return;
      }

      if (req.method === "POST" && pathname === "/token") {
        const body = await readBody(req);
        const form = parseForm(body);
        const clientId = form.client_id ?? "test";
        const accessToken = `mock-access-${Date.now()}`;
        const idToken = await mintIdToken(clientId);
        return sendJson(res, 200, {
          access_token: accessToken,
          id_token: idToken,
          token_type: "Bearer",
          expires_in: 300,
          scope: "openid profile email",
        });
      }

      if (req.method === "GET" && pathname === "/userinfo") {
        return sendJson(res, 200, buildClaims());
      }

      res.statusCode = 404;
      res.end("Not found");
    } catch (err) {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : String(err));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    url: issuer,
    port,
    get lastCode() {
      return state.lastCode;
    },
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
