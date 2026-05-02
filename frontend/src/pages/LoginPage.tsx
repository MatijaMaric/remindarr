import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { authClient } from "../lib/auth-client";
import { getDailyPlaceholder } from "../data/movie-characters";

function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" &&
    !!window.PublicKeyCredential;
}

export default function LoginPage() {
  const { user, providers, login, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLocalLogin, setShowLocalLogin] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const oidcConfigured = !!providers?.oidc;
  const passkeyAvailable = !!providers?.passkey && isWebAuthnSupported();
  const usernamePlaceholder = useMemo(() => getDailyPlaceholder(), []);

  // Redirect if already logged in
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  // Show OIDC callback errors
  useEffect(() => {
    const oidcError = searchParams.get("error");
    if (oidcError) setError(t("login.loginFailed", { error: oidcError }));
  }, [searchParams, t]);

  // Enable passkey autofill (conditional UI) — only when the username field is
  // visible, otherwise the pending ceremony has nothing to attach to and can
  // conflict with an explicit passkey button click (surfaces as AUTH_CANCELLED).
  useEffect(() => {
    if (!passkeyAvailable || !showLocalLogin) return;
    let cancelled = false;
    (async () => {
      try {
        const available = typeof PublicKeyCredential.isConditionalMediationAvailable === "function"
          && await PublicKeyCredential.isConditionalMediationAvailable();
        if (!available || cancelled) return;
        const result = await authClient.signIn.passkey({ autoFill: true });
        if (cancelled) return;
        if (result?.error) return;
        const session = await authClient.getSession();
        if (session.data?.user && !cancelled) {
          await refresh();
          if (!cancelled) navigate("/", { replace: true });
        }
      } catch {
        // Autofill silently fails if user doesn't select a passkey
      }
    })();
    return () => { cancelled = true; };
  }, [passkeyAvailable, showLocalLogin, navigate, refresh]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleOidcLogin() {
    authClient.signIn.social({
      provider: "pocketid",
      callbackURL: "/",
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
        const message = result.error.message ? String(result.error.message) : "";
        if (code === "AUTH_CANCELLED" || message === "AUTH_CANCELLED") return;
        setError(message || t("login.passkeyFailed"));
        return;
      }
      const session = await authClient.getSession();
      if (session.data?.user) {
        await refresh();
        navigate("/", { replace: true });
      }
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
  }, [navigate, refresh, t]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-white text-center mb-8">{t("login.title")}</h2>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm select-text">
            {error}
          </div>
        )}

        {passkeyAvailable && (
          <button
            type="button"
            onClick={handlePasskeyLogin}
            disabled={passkeyLoading}
            className="block w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-lg transition-colors text-center cursor-pointer disabled:opacity-50 mb-3"
          >
            {passkeyLoading ? t("login.signingIn") : t("login.signInWithPasskey")}
          </button>
        )}

        {oidcConfigured && (
          <button
            type="button"
            onClick={handleOidcLogin}
            className={`block w-full py-3 px-4 ${passkeyAvailable ? "bg-zinc-700 hover:bg-zinc-600 text-white" : "bg-amber-500 hover:bg-amber-400 text-zinc-950"} font-medium rounded-lg transition-colors text-center cursor-pointer`}
          >
            {t("login.signInWith", { provider: providers.oidc!.name })}
          </button>
        )}

        {(oidcConfigured || passkeyAvailable) && !showLocalLogin && (
          <button
            type="button"
            onClick={() => setShowLocalLogin(true)}
            className="mt-4 w-full text-center text-sm text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            {t("login.signInWithUsername")}
          </button>
        )}

        {(!oidcConfigured && !passkeyAvailable || showLocalLogin) && (
          <>
            {(oidcConfigured || passkeyAvailable) && (
              <div className="my-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-zinc-700" />
                <span className="text-xs text-zinc-500 uppercase">{t("login.or")}</span>
                <div className="flex-1 h-px bg-zinc-700" />
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-zinc-300 mb-1">
                  {t("login.username")}
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:border-transparent"
                  placeholder={usernamePlaceholder}
                  autoComplete="username webauthn"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1">
                  {t("login.password")}
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:border-transparent"
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? t("login.signingIn") : t("login.signIn")}
              </button>
            </form>

          </>
        )}

        <p className="mt-6 text-center text-sm text-zinc-500">
          {t("login.noAccount")}{" "}
          <Link to="/signup" className="text-amber-400 hover:text-amber-300 transition-colors">
            {t("login.signUp")}
          </Link>
        </p>
      </div>
    </div>
  );
}
