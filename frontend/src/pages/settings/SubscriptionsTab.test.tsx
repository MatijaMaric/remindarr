import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import "../../i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as api from "../../api";

const mockRefreshSubscriptions = mock(() => Promise.resolve());
// Stable reference — SubscriptionsTab's useEffect([subscriptions]) uses reference equality
const STABLE_SUBSCRIPTIONS = { providerIds: [] as number[], onlyMine: false };

mock.module("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      username: "testuser",
      display_name: null,
      auth_provider: "local",
      is_admin: false,
    },
    providers: null,
    loading: false,
    sessionStatus: "authenticated",
    subscriptions: STABLE_SUBSCRIPTIONS,
    refreshSubscriptions: mockRefreshSubscriptions,
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  }),
}));

const { default: SubscriptionsTab } = await import("./SubscriptionsTab");

let spies: ReturnType<typeof spyOn>[] = [];
let queryClient: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  mockRefreshSubscriptions.mockClear();
  STABLE_SUBSCRIPTIONS.providerIds = [];
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  spies = [
    spyOn(api, "getProviders").mockResolvedValue({
      providers: [
        {
          id: 8,
          name: "Netflix",
          technical_name: "netflix",
          icon_url: "https://example.com/netflix.png",
        },
        {
          id: 337,
          name: "Disney+",
          technical_name: "disneyplus",
          icon_url: "https://example.com/disney.png",
        },
      ],
      regionProviderIds: [8, 337],
    } as any),
    spyOn(api, "updateSubscriptions").mockResolvedValue({
      providerIds: [8],
    } as any),
    spyOn(api, "updateOnlyMine").mockResolvedValue({ onlyMine: true } as any),
  ];
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("SubscriptionsTab", () => {
  it("shows loading until a slow request returns a valid empty catalog", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof api.getProviders>>) => void;
    (api.getProviders as ReturnType<typeof spyOn>).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<SubscriptionsTab />, { wrapper: Wrapper });
    expect(screen.getByRole("status").textContent).toBe(
      "Loading streaming services...",
    );
    expect(screen.queryByText("No providers found.")).toBeNull();
    await act(async () => resolve({ providers: [], regionProviderIds: [] }));
    await waitFor(() =>
      expect(screen.getByText("No providers found.")).toBeDefined(),
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("retries a failed catalog without changing saved subscriptions", async () => {
    STABLE_SUBSCRIPTIONS.providerIds = [8];
    (api.getProviders as ReturnType<typeof spyOn>).mockRejectedValueOnce(
      new Error("503"),
    );
    render(<SubscriptionsTab />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Could not load streaming services",
      ),
    );
    expect(screen.queryByText("No providers found.")).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Retry" })),
    );
    await waitFor(() =>
      expect(
        (screen.getByRole("checkbox", { name: "Netflix" }) as HTMLInputElement)
          .checked,
      ).toBe(true),
    );
    expect(api.updateSubscriptions).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps selected providers visible during a failed refresh and retry", async () => {
    STABLE_SUBSCRIPTIONS.providerIds = [8];
    render(<SubscriptionsTab />, { wrapper: Wrapper });
    await waitFor(() => screen.getByRole("checkbox", { name: "Netflix" }));
    (api.getProviders as ReturnType<typeof spyOn>).mockRejectedValueOnce(
      new Error("503"),
    );
    act(() => {
      void queryClient.invalidateQueries({
        queryKey: ["subscription-providers"],
      });
    });
    await waitFor(() => screen.getByRole("alert"));
    expect(
      (screen.getByRole("checkbox", { name: "Netflix" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    let resolve!: (value: Awaited<ReturnType<typeof api.getProviders>>) => void;
    (api.getProviders as ReturnType<typeof spyOn>).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Retry" })),
    );
    await waitFor(() => screen.getByRole("status"));
    expect(
      (screen.getByRole("checkbox", { name: "Netflix" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    await act(async () =>
      resolve({
        providers: [
          { id: 8, name: "Netflix", technical_name: "netflix", icon_url: null },
        ],
        regionProviderIds: [8],
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("status") === null).toBe(true),
    );
    expect(
      (screen.getByRole("checkbox", { name: "Netflix" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(api.updateSubscriptions).not.toHaveBeenCalled();
  });
  it("renders providers fetched from the API", async () => {
    render(<SubscriptionsTab />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
      expect(screen.getByText("Disney+")).toBeDefined();
    });
  });

  it("calls updateSubscriptions when a provider checkbox is toggled", async () => {
    render(<SubscriptionsTab />, { wrapper: Wrapper });

    await waitFor(() => screen.getByText("Netflix"));

    const netflixLabel = screen.getByText("Netflix").closest("label")!;
    await act(async () => {
      fireEvent.click(netflixLabel);
    });

    await waitFor(() => {
      expect(api.updateSubscriptions).toHaveBeenCalledTimes(1);
      const call = (api.updateSubscriptions as ReturnType<typeof spyOn>).mock
        .calls[0];
      expect((call[0] as number[]).includes(8)).toBe(true);
    });
  });

  it("calls refreshSubscriptions after updating providers", async () => {
    render(<SubscriptionsTab />, { wrapper: Wrapper });

    await waitFor(() => screen.getByText("Netflix"));

    const netflixLabel = screen.getByText("Netflix").closest("label")!;
    await act(async () => {
      fireEvent.click(netflixLabel);
    });

    await waitFor(() => {
      expect(mockRefreshSubscriptions).toHaveBeenCalled();
    });
  });

  it("shows an error message and skips refreshSubscriptions when updateSubscriptions rejects", async () => {
    (api.updateSubscriptions as ReturnType<typeof spyOn>).mockRejectedValue(
      new Error("500"),
    );

    render(<SubscriptionsTab />, { wrapper: Wrapper });
    await waitFor(() => screen.getByText("Netflix"));

    const netflixLabel = screen.getByText("Netflix").closest("label")!;
    await act(async () => {
      fireEvent.click(netflixLabel);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Failed to save. Please try again."),
      ).toBeDefined();
      expect(mockRefreshSubscriptions).not.toHaveBeenCalled();
    });
  });

  it("calls updateOnlyMine when the Apply Automatically switch is toggled", async () => {
    render(<SubscriptionsTab />, { wrapper: Wrapper });

    await waitFor(() => screen.getByText("Netflix"));

    // The onlyMine switch renders as a button with role="switch"
    const switchEl = screen.getByRole("switch");
    await act(async () => {
      fireEvent.click(switchEl);
    });

    await waitFor(() => {
      expect(api.updateOnlyMine).toHaveBeenCalledTimes(1);
      const call = (api.updateOnlyMine as ReturnType<typeof spyOn>).mock
        .calls[0];
      expect(call[0]).toBe(true);
    });
  });
});
