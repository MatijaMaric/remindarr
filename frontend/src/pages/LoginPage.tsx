import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { authClient } from "../lib/auth-client";
import { getDailyPlaceholder } from "../data/movie-characters";
import { returnTo } from "../lib/returnTo";

function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

const SECONDARY_BUTTON =
  "block w-full py-2.5 px-4 bg-muted-hover hover:bg-muted-hover/80 text-foreground font-medium rounded-md transition-colors text-center cursor-pointer disabled:opacity-50";

export default function LoginPage() {
  const { user, providers, login, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const destination = returnTo(location.state);
  const { t } = useTranslation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const oidcConfigured = !!providers?.oidc;
  const passkeyAvailable = !!providers?.passkey && isWebAuthnSupported();
  const usernamePlaceholder = useMemo(() => getDailyPlaceholder(), []);

  // The only redirect after sign-in: login/signup/refresh set `user`, and this
  // effect sends the user on. A second navigate would re-run the destination's
  // effects (e.g. redeem an invite code twice).
  useEffect(() => {
    if (user) navigate(destination, { replace: true });
  }, [user, navigate, destination]);

  // OIDC callback errors: the code comes from the URL, so show a fixed message
  // rather than echoing whatever text the link carries.
  useEffect(() => {
    if (searchParams.get("error")) setError(t("login.loginFailed"));
  }, [searchParams, t]);

  // Passkey autofill (conditional UI) on the username field. An explicit
  // passkey button click aborts this pending ceremony and starts its own.
  useEffect(() => {
    if (!passkeyAvailable) return;
    let cancelled = false;
    (async () => {
      try {
        const available =
          typeof PublicKeyCredential.isConditionalMediationAvailable ===
            "function" &&
          (await PublicKeyCredential.isConditionalMediationAvailable());
        if (!available || cancelled) return;
        const result = await authClient.signIn.passkey({ autoFill: true });
        if (cancelled) return;
        if (result?.error) return;
        const session = await authClient.getSession();
        if (session.data?.user && !cancelled) await refresh();
      } catch {
        // Autofill silently fails if user doesn't select a passkey
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passkeyAvailable, refresh]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleOidcLogin() {
    authClient.signIn.social({
      provider: "pocketid",
      callbackURL: destination,
    });
  }

  const handlePasskeyLogin = useCallback(async () => {
    setError("");
    setPasskeyLoading(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) {
        // better-auth maps every WebAuthn failure (user cancel, timeout,
        // conditional-UI conflict) to AUTH_CANCELLED — treat it as a silent
        // dismissal and show other errors normally.
        const code = (result.error as { code?: string }).code;
        const message = result.error.message
          ? String(result.error.message)
          : "";
        if (code === "AUTH_CANCELLED" || message === "AUTH_CANCELLED") return;
        setError(message || t("login.passkeyFailed"));
        return;
      }
      const session = await authClient.getSession();
      if (session.data?.user) await refresh();
    } catch (err: unknown) {
      // Don't show error if user cancelled the WebAuthn prompt
      if (err instanceof Error && err.name !== "NotAllowedError") {
        setError(err.message || t("login.passkeyFailed"));
      } else if (!(err instanceof Error)) {
        setError(t("login.passkeyFailed"));
      }
    } finally {
      setPasskeyLoading(false);
    }
  }, [refresh, t]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-foreground text-center mb-8">
          {t("login.title")}
        </h1>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive-soft border border-destructive/40 text-destructive text-sm select-text">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-foreground-secondary mb-1"
            >
              {t("login.username")}
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-border focus-visible:border-transparent"
              placeholder={usernamePlaceholder}
              autoComplete="username webauthn"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground-secondary mb-1"
            >
              {t("login.password")}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-border focus-visible:border-transparent"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? t("login.signingIn") : t("login.signIn")}
          </button>
        </form>

        {(passkeyAvailable || oidcConfigured) && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="flex-1 h-px bg-muted-hover" />
              <span className="text-xs text-muted-foreground uppercase">
                {t("login.or")}
              </span>
              <div className="flex-1 h-px bg-muted-hover" />
            </div>

            <div className="space-y-3">
              {passkeyAvailable && (
                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  className={SECONDARY_BUTTON}
                >
                  {passkeyLoading
                    ? t("login.signingIn")
                    : t("login.signInWithPasskey")}
                </button>
              )}

              {oidcConfigured && (
                <button
                  type="button"
                  onClick={handleOidcLogin}
                  className={SECONDARY_BUTTON}
                >
                  {t("login.signInWith", { provider: providers.oidc!.name })}
                </button>
              )}
            </div>
          </>
        )}

        <details className="mt-6 text-sm text-foreground-secondary">
          <summary className="cursor-pointer underline">
            {t("login.recoveryTitle")}
          </summary>
          <p className="mt-2">{t("login.recoveryHelp")}</p>
        </details>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("login.noAccount")}{" "}
          <Link
            to="/signup"
            state={location.state}
            className="text-primary-text hover:text-primary-text transition-colors underline underline-offset-2"
          >
            {t("login.signUp")}
          </Link>
        </p>

        {/* Phones only: on wider screens the site footer has these links. */}
        <p className="mt-6 text-center text-xs text-muted-foreground md:hidden">
          <Link
            to="/privacy"
            className="hover:text-foreground-secondary transition-colors"
          >
            {t("privacy.title")}
          </Link>
          <span className="mx-2">·</span>
          <Link
            to="/terms"
            className="hover:text-foreground-secondary transition-colors"
          >
            {t("terms.title")}
          </Link>
        </p>
      </div>
    </div>
  );
}
