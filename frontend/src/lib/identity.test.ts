import { afterEach, expect, it } from "bun:test";
import { createQueryClient } from "./queryClient";
import {
  AUTH_CHANGE_KEY,
  cancelIdentityRequests,
  identityRequest,
} from "./identity";

afterEach(() => {
  cancelIdentityRequests();
  localStorage.removeItem(AUTH_CHANGE_KEY);
});

it("isolates query hashes and stops late query and optimistic mutation work", async () => {
  const alice = createQueryClient("alice");
  alice.setQueryData(["tracked"], "Alice private note");
  let finishQuery!: (value: string) => void;
  const pendingQuery = alice
    .fetchQuery({
      queryKey: ["late"],
      queryFn: () =>
        new Promise<string>((resolve) => {
          finishQuery = resolve;
        }),
    })
    .catch(() => undefined);
  let finishOptimism!: () => void;
  let mutationSent = false;
  const optimistic = new Promise<void>((resolve) => {
    finishOptimism = resolve;
  });
  const mutation = alice.getMutationCache().build(alice, {
    onMutate: () => optimistic,
    mutationFn: async () => {
      mutationSent = true;
    },
  });
  const pendingMutation = mutation.execute(undefined).catch((error) => error);
  await Promise.resolve();
  cancelIdentityRequests();
  await alice.cancelQueries();
  alice.clear();
  const bob = createQueryClient("bob");
  bob.setQueryData(["tracked"], "Bob title");
  finishOptimism();
  finishQuery("Alice late note");
  expect((await pendingMutation).name).toBe("AbortError");
  await pendingQuery;
  expect(mutationSent).toBe(false);
  expect(alice.getQueryData(["late"])).toBeUndefined();
  expect(bob.getQueryData(["tracked"])).toBe("Bob title");
  expect(bob.getQueryCache().getAll()[0].queryHash).toContain("bob");
  bob.clear();
});

it("fences a cross-tab response even before the storage event is handled", () => {
  const request = identityRequest();
  localStorage.setItem(AUTH_CHANGE_KEY, "another-session");
  expect(() => request.check()).toThrow("Account changed");
});

it("does not dispatch a deferred mutation after a cross-tab revision, before event delivery", async () => {
  const alice = createQueryClient("alice");
  let release!: () => void;
  let sent = false;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const mutation = alice.getMutationCache().build(alice, {
    onMutate: () => paused,
    mutationFn: async () => {
      sent = true;
    },
  });
  const result = mutation.execute(undefined).catch((error) => error);
  await Promise.resolve();
  localStorage.setItem(
    AUTH_CHANGE_KEY,
    JSON.stringify({ phase: "changing", nonce: "bob-transition" }),
  );
  release();
  expect((await result).name).toBe("AbortError");
  expect(sent).toBe(false);
  alice.clear();
});
