import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import "../../i18n";
import * as api from "../../api";

function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

mock.module("../../hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: mock(() => {}),
  }),
}));

mock.module("../../hooks/useAppearance", () => ({
  applyAppearance: mock(() => {}),
}));

mock.module("../../components/ThemePicker", () => ({
  default: () => <div data-testid="theme-picker">ThemePicker</div>,
}));

mock.module("../../components/AccentPicker", () => ({
  default: ({ onChange }: any) => (
    <div data-testid="accent-picker" onClick={() => onChange("amber")}>AccentPicker</div>
  ),
}));

mock.module("../../components/DensityPicker", () => ({
  default: ({ onChange }: any) => (
    <div data-testid="density-picker" onClick={() => onChange("comfortable")}>DensityPicker</div>
  ),
}));

const { default: AppearanceTab } = await import("./AppearanceTab");

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "getAppearanceSettings").mockResolvedValue({
      themeVariant: "dark",
      accentColor: "amber",
      density: "comfortable",
      reduceMotion: 0,
      highContrast: 0,
      hideEpisodeSpoilers: 0,
      autoplayTrailers: 0,
    } as any),
    spyOn(api, "getHomepageLayout").mockResolvedValue({
      homepage_layout: [
        { id: "up_next", enabled: true },
        { id: "unwatched", enabled: true },
      ],
    } as any),
    spyOn(api, "getCrowdedWeekSettings").mockResolvedValue({
      crowdedWeekBadgeEnabled: 1,
      crowdedWeekThreshold: 5,
    } as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("AppearanceTab", () => {
  it("renders without crashing", async () => {
    const client = newTestClient();
    render(<AppearanceTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByTestId("theme-picker")).toBeDefined();
    });
  });

  it("shows homepage layout section", async () => {
    const client = newTestClient();
    render(<AppearanceTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      // Check that the layout sections rendered (at least one section item)
      expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    });
  });

  it("shows crowded week section", async () => {
    const client = newTestClient();
    render(<AppearanceTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      // crowded week toggle renders an aria-pressed button
      expect(screen.getAllByRole("button", { pressed: true }).length).toBeGreaterThan(0);
    });
  });
});
