import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";
import {
  advisoryAction,
  parseAdvisoryLevel,
  parseAllowlist,
  type AdvisoryAction,
  type AdvisorySettings,
} from "../lib/contentAdvisory";

export const ADVISORY_QUERY_KEY = ["advisory-settings"] as const;

export function useContentAdvisory(): {
  settings: AdvisorySettings;
  actionFor: (
    certification: string | null | undefined,
    titleId?: string,
  ) => AdvisoryAction;
  setLevel: (level: AdvisorySettings["level"]) => Promise<void>;
  setAllowed: (titleId: string, allowed: boolean) => Promise<void>;
} {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ADVISORY_QUERY_KEY,
    queryFn: ({ signal }) => api.getAdvisorySettings(signal),
    enabled: !!user,
  });

  const settings: AdvisorySettings = useMemo(
    () => ({
      level: parseAdvisoryLevel(data?.level),
      allowlist: parseAllowlist(data?.allowlist),
    }),
    [data?.level, data?.allowlist],
  );

  const actionFor = useCallback(
    (certification: string | null | undefined, titleId?: string) =>
      advisoryAction(certification, titleId, settings),
    [settings],
  );

  const setLevel = useCallback(
    async (level: AdvisorySettings["level"]) => {
      const next = await api.updateAdvisorySettings({ level });
      qc.setQueryData(ADVISORY_QUERY_KEY, next);
    },
    [qc],
  );

  const setAllowed = useCallback(
    async (titleId: string, allowed: boolean) => {
      const next = await api.updateAdvisoryAllowlist(titleId, allowed);
      qc.setQueryData(ADVISORY_QUERY_KEY, next);
    },
    [qc],
  );

  return { settings, actionFor, setLevel, setAllowed };
}
