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
        <h1 className="text-2xl font-bold text-white text-center mb-8">
          {t("signup.title")}
        </h1>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              {t("signup.username")}
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:border-transparent"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              {t("signup.email")}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:border-transparent"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              {t("signup.displayName")}{" "}
              <span className="text-zinc-500 font-normal">
                ({t("common.optional")})
              </span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:border-transparent"
              autoComplete="name"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              {t("signup.password")}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 bg-zinc-800 border border-white/[0.08] rounded-lg text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:border-transparent"
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
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {t("signup.passwordHint")}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? t("signup.creating") : t("signup.signUp")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-400">
          {t("signup.alreadyHaveAccount")}{" "}
          <Link
            to="/login"
            className="text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2"
          >
            {t("signup.signIn")}
          </Link>
        </p>

        <p className="mt-6 text-center text-xs text-zinc-500">
          <Link to="/privacy" className="hover:text-zinc-300 transition-colors">
            {t("privacy.title")}
          </Link>
          <span className="mx-2">·</span>
          <Link to="/terms" className="hover:text-zinc-300 transition-colors">
            {t("terms.title")}
          </Link>
        </p>
      </div>
    </div>
  );
}
