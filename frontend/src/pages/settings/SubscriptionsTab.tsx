import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../../api";
import type { Provider } from "../../types";
import { SCard, SSwitch } from "../../components/settings/kit";
import { useAuth } from "../../context/AuthContext";

export default function SubscriptionsTab() {
  const { t } = useTranslation();
  const { subscriptions, refreshSubscriptions } = useAuth();

  const [allProviders, setAllProviders] = useState<Provider[]>([]);
  const [regionProviderIds, setRegionProviderIds] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [onlyMine, setOnlyMine] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.getProviders(controller.signal).then((data) => {
      setAllProviders(data.providers);
      setRegionProviderIds(data.regionProviderIds);
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (subscriptions) {
      setSelectedIds(new Set(subscriptions.providerIds));
      setOnlyMine(subscriptions.onlyMine);
    }
  }, [subscriptions]);

  async function toggleProvider(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
    setSaving(true);
    try {
      await api.updateSubscriptions(Array.from(next));
      await refreshSubscriptions();
    } finally {
      setSaving(false);
    }
  }

  async function toggleOnlyMine(value: boolean) {
    setOnlyMine(value);
    try {
      await api.updateOnlyMine(value);
      await refreshSubscriptions();
    } catch {
      setOnlyMine(!value);
    }
  }

  const regionIds = new Set(regionProviderIds);
  const regionProviders = allProviders.filter((p) => regionIds.has(p.id));
  const otherProviders = allProviders.filter((p) => !regionIds.has(p.id));

  function ProviderRow({ provider }: { provider: Provider }) {
    const checked = selectedIds.has(provider.id);
    return (
      <label className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-white/[0.03] rounded-lg px-2 -mx-2 transition-colors">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={() => toggleProvider(provider.id)}
          disabled={saving}
        />
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? "border-amber-400 bg-amber-400" : "border-zinc-600 bg-transparent"}`}>
          {checked && (
            <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          )}
        </div>
        {provider.icon_url && (
          <img src={provider.icon_url} alt="" className="w-6 h-6 rounded flex-shrink-0" loading="lazy" />
        )}
        <span className="text-sm text-zinc-200">{provider.name}</span>
      </label>
    );
  }

  return (
    <div>
      <SCard
        title={t("settings.subscriptions.title")}
        subtitle={t("settings.subscriptions.subtitle")}
      >
        {allProviders.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("settings.subscriptions.empty")}</p>
        ) : (
          <div className="space-y-6">
            {regionProviders.length > 0 && (
              <div>
                <div className="text-xs font-mono font-semibold uppercase tracking-widest text-amber-400 mb-2">
                  {t("settings.subscriptions.regionProviders")}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
                  {regionProviders.map((p) => <ProviderRow key={p.id} provider={p} />)}
                </div>
              </div>
            )}
            {otherProviders.length > 0 && (
              <div>
                <div className="text-xs font-mono font-semibold uppercase tracking-widest text-zinc-500 mb-2">
                  {t("settings.subscriptions.otherProviders")}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
                  {otherProviders.map((p) => <ProviderRow key={p.id} provider={p} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </SCard>

      <SCard>
        <SSwitch
          label={t("settings.subscriptions.onlyMine.label")}
          sub={t("settings.subscriptions.onlyMine.description")}
          on={onlyMine}
          onChange={toggleOnlyMine}
        />
      </SCard>
    </div>
  );
}
