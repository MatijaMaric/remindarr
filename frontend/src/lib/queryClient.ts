import { hashKey, QueryClient } from "@tanstack/react-query";
import { identityRequest } from "./identity";

type MutationOptions = NonNullable<
  Parameters<QueryClient["defaultMutationOptions"]>[0]
>;

class AccountQueryClient extends QueryClient {
  private readonly identity = identityRequest();

  override defaultMutationOptions<T extends MutationOptions>(options?: T): T {
    const defaults = super.defaultMutationOptions(options);
    const mutationFn = defaults.mutationFn;
    if (!mutationFn) return defaults;
    return {
      ...defaults,
      mutationFn: async (...args: Parameters<typeof mutationFn>) => {
        // Runs after asynchronous optimistic callbacks, immediately before the
        // request. Also fences another tab's cookie change before its event runs.
        this.identity.check();
        const result = await mutationFn(...args);
        this.identity.check();
        return result;
      },
    };
  }
}

// Every query hash includes the account, including personalized catalogue data.
// Each identity gets a separate client so old optimistic callbacks stay isolated.
export function createQueryClient(userId: string | null) {
  return new AccountQueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: (key) => hashKey([userId, ...key]),
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      },
      // Offline writes fail visibly; they must never resume under a later cookie.
      mutations: { networkMode: "always", retry: false },
    },
  });
}
