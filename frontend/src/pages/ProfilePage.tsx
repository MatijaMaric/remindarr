import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";

interface OidcField {
  value: string;
  source: "env" | "db" | "unset";
}

interface AdminSettings {
  oidc: {
    issuer_url: OidcField;
    client_id: OidcField;
    client_secret: OidcField;
    redirect_uri: OidcField;
  };
  oidc_configured: boolean;
}

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <UserSection />
      {user.is_admin && <AdminSection />}
    </div>
  );
}

function UserSection() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordErr, setPasswordErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg("");
    setPasswordErr("");
    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordMsg("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setPasswordErr(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-bold text-white mb-4">Profile</h2>
      <div className="bg-gray-900 rounded-lg p-5 space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-400">Username</span>
          <span className="text-white">{user?.username}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Display Name</span>
          <span className="text-white">{user?.display_name || "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Auth Provider</span>
          <span className="text-white capitalize">{user?.auth_provider}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Role</span>
          <span className="text-white">{user?.is_admin ? "Admin" : "User"}</span>
        </div>
      </div>

      {user?.auth_provider === "local" && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-white mb-3">Change Password</h3>
          <form onSubmit={handleChangePassword} className="bg-gray-900 rounded-lg p-5 space-y-4">
            {passwordMsg && (
              <div className="p-3 rounded-lg bg-green-900/50 border border-green-700 text-green-200 text-sm">
                {passwordMsg}
              </div>
            )}
            {passwordErr && (
              <div className="p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm">
                {passwordErr}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                minLength={6}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Changing..." : "Change Password"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function AdminSection() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");

  useEffect(() => {
    api.getAdminSettings().then((data) => {
      setSettings(data);
      setIssuerUrl(data.oidc.issuer_url.source !== "env" ? data.oidc.issuer_url.value : "");
      setClientId(data.oidc.client_id.source !== "env" ? data.oidc.client_id.value : "");
      setClientSecret(""); // Never prefill secrets
      setRedirectUri(
        data.oidc.redirect_uri.source !== "env"
          ? data.oidc.redirect_uri.value || `${window.location.origin}/api/auth/oidc/callback`
          : ""
      );
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    setSaving(true);
    try {
      const body: Record<string, string> = {
        oidc_issuer_url: issuerUrl,
        oidc_client_id: clientId,
        oidc_redirect_uri: redirectUri,
      };
      // Only send client_secret if changed
      if (clientSecret) {
        body.oidc_client_secret = clientSecret;
      }
      const result = await api.updateAdminSettings(body);
      setMsg(result.oidc_configured ? "OIDC configured successfully" : "Settings saved");
      // Refresh settings
      const data = await api.getAdminSettings();
      setSettings(data);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-gray-500">Loading settings...</div>;

  return (
    <section>
      <h2 className="text-xl font-bold text-white mb-4">Admin Settings</h2>

      <div className="bg-gray-900 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">OpenID Connect</h3>
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              settings?.oidc_configured
                ? "bg-green-900/50 text-green-300"
                : "bg-gray-800 text-gray-400"
            }`}
          >
            {settings?.oidc_configured ? "Configured" : "Not configured"}
          </span>
        </div>

        {msg && (
          <div className="mb-4 p-3 rounded-lg bg-green-900/50 border border-green-700 text-green-200 text-sm">
            {msg}
          </div>
        )}
        {err && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-200 text-sm">
            {err}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <SettingField
            label="Issuer URL"
            value={issuerUrl}
            onChange={setIssuerUrl}
            placeholder="https://auth.example.com"
            source={settings?.oidc.issuer_url.source}
            envValue={settings?.oidc.issuer_url.source === "env" ? settings.oidc.issuer_url.value : undefined}
          />
          <SettingField
            label="Client ID"
            value={clientId}
            onChange={setClientId}
            placeholder="my-client-id"
            source={settings?.oidc.client_id.source}
            envValue={settings?.oidc.client_id.source === "env" ? settings.oidc.client_id.value : undefined}
          />
          <SettingField
            label="Client Secret"
            value={clientSecret}
            onChange={setClientSecret}
            placeholder={settings?.oidc.client_secret.source !== "unset" ? "••••••••  (leave blank to keep)" : ""}
            type="password"
            source={settings?.oidc.client_secret.source}
            envValue={settings?.oidc.client_secret.source === "env" ? "********" : undefined}
          />
          <SettingField
            label="Redirect URI"
            value={redirectUri}
            onChange={setRedirectUri}
            placeholder={`${window.location.origin}/api/auth/oidc/callback`}
            source={settings?.oidc.redirect_uri.source}
            envValue={settings?.oidc.redirect_uri.source === "env" ? settings.oidc.redirect_uri.value : undefined}
          />

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving..." : "Save OIDC Settings"}
          </button>
        </form>
      </div>
    </section>
  );
}

function SettingField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  source,
  envValue,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  source?: string;
  envValue?: string;
}) {
  const isEnv = source === "env";

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="block text-sm font-medium text-gray-300">{label}</label>
        {isEnv && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-900/50 text-amber-300">
            ENV
          </span>
        )}
      </div>
      {isEnv ? (
        <div className="px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-400 text-sm">
          {envValue} <span className="text-gray-600">(set via environment variable)</span>
        </div>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      )}
    </div>
  );
}
