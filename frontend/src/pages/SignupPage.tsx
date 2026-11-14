import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function SignupPage() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup(username, email, password, name || username);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-foreground text-center mb-8">
          {t("signup.title")}
        </h1>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive-soft border border-destructive/40 text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-foreground-secondary mb-1"
            >
              {t("signup.username")}
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-border focus-visible:border-transparent"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground-secondary mb-1"
            >
              {t("signup.email")}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-border focus-visible:border-transparent"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-foreground-secondary mb-1"
            >
              {t("signup.displayName")}{" "}
              <span className="text-muted-foreground font-normal">
                ({t("common.optional")})
              </span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-border focus-visible:border-transparent"
              autoComplete="name"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground-secondary mb-1"
            >
              {t("signup.password")}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 bg-muted border border-border rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-border focus-visible:border-transparent"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword
                    ? t("signup.hidePassword")
                    : t("signup.showPassword")
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground-secondary transition-colors p-1"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("signup.passwordHint")}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? t("signup.creating") : t("signup.signUp")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("signup.alreadyHaveAccount")}{" "}
          <Link
            to="/login"
            className="text-primary-text hover:text-primary-text transition-colors underline underline-offset-2"
          >
            {t("signup.signIn")}
          </Link>
        </p>

        <p className="mt-6 text-center text-xs text-muted-foreground">
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
