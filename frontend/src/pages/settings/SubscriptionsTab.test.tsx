import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import "../../i18n";
import * as api from "../../api";

const mockRefreshSubscriptions = mock(() => Promise.resolve());
// Stable reference — SubscriptionsTab's useEffect([subscriptions]) uses reference equality
const STABLE_SUBSCRIPTIONS = { providerIds: [] as number[], onlyMine: false };

mock.module("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", username: "testuser", display_name: null, auth_provider: "local", is_admin: false },
    providers: null,
    loading: false,
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

beforeEach(() => {
  mockRefreshSubscriptions.mockClear();
  spies = [
    spyOn(api, "getProviders").mockResolvedValue({
      providers: [
        { id: 8, name: "Netflix", technical_name: "netflix", icon_url: "https://example.com/netflix.png" },
        { id: 337, name: "Disney+", technical_name: "disneyplus", icon_url: "https://example.com/disney.png" },
      ],
      regionProviderIds: [8, 337],
    } as any),
    spyOn(api, "updateSubscriptions").mockResolvedValue({ providerIds: [8] } as any),
    spyOn(api, "updateOnlyMine").mockResolvedValue({ onlyMine: true } as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("SubscriptionsTab", () => {
  it("renders providers fetched from the API", async () => {
    render(<SubscriptionsTab />);

    await waitFor(() => {
      expect(screen.getByText("Netflix")).toBeDefined();
      expect(screen.getByText("Disney+")).toBeDefined();
    });
  });

  it("calls updateSubscriptions when a provider checkbox is toggled", async () => {
    render(<SubscriptionsTab />);

    await waitFor(() => screen.getByText("Netflix"));

    const netflixLabel = screen.getByText("Netflix").closest("label")!;
    await act(async () => {
      fireEvent.click(netflixLabel);
    });

    await waitFor(() => {
      expect(api.updateSubscriptions).toHaveBeenCalledTimes(1);
      const call = (api.updateSubscriptions as ReturnType<typeof spyOn>).mock.calls[0];
      expect((call[0] as number[]).includes(8)).toBe(true);
    });
  });

  it("calls refreshSubscriptions after updating providers", async () => {
    render(<SubscriptionsTab />);

    await waitFor(() => screen.getByText("Netflix"));

    const netflixLabel = screen.getByText("Netflix").closest("label")!;
    await act(async () => {
      fireEvent.click(netflixLabel);
    });

    await waitFor(() => {
      expect(mockRefreshSubscriptions).toHaveBeenCalled();
    });
  });

  it("calls updateOnlyMine when the Apply Automatically switch is toggled", async () => {
    render(<SubscriptionsTab />);

    await waitFor(() => screen.getByText("Netflix"));

    // The onlyMine switch renders as a button with role="switch"
    const switchEl = screen.getByRole("switch");
    await act(async () => {
      fireEvent.click(switchEl);
    });

    await waitFor(() => {
      expect(api.updateOnlyMine).toHaveBeenCalledTimes(1);
      const call = (api.updateOnlyMine as ReturnType<typeof spyOn>).mock.calls[0];
      expect(call[0]).toBe(true);
    });
  });
});
