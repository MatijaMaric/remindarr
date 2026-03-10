export type AuthUser = {
  id: string;
  username: string;
  display_name: string | null;
  auth_provider: string;
  is_admin: boolean;
};

export type AppEnv = {
  Variables: {
    user?: AuthUser;
  };
};
