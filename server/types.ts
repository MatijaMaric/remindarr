import type { Platform } from "./platform/types";
import type { BetterAuthInstance } from "./auth/better-auth";

export type AuthUser = {
  id: string;
  username: string;
  name: string | null;
  role: string | null;
  is_admin: boolean;
};

export type AppEnv = {
  Variables: {
    user?: AuthUser;
    platform?: Platform;
    auth?: BetterAuthInstance;
  };
};
