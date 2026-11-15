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
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import i18n, { LANGUAGE_STORAGE_KEY } from "../../i18n";
import * as api from "../../api";

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
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
    <div data-testid="accent-picker" onClick={() => onChange("amber")}>
      AccentPicker
    </div>
  ),
}));

mock.module("../../components/DensityPicker", () => ({
  default: ({ onChange }: any) => (
    <div data-testid="density-picker" onClick={() => onChange("comfortable")}>
      DensityPicker
    </div>
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
        { id: "unwatched", enabled: true },
        { id: "trending", enabled: true },
      ],
    } as any),
    spyOn(api, "getCrowdedWeekSettings").mockResolvedValue({
      crowdedWeekBadgeEnabled: 1,
      crowdedWeekThreshold: 5,
    } as any),
    spyOn(api, "getAdvisorySettings").mockResolvedValue({
      level: "none",
      allowlist: [],
    }),
    spyOn(api, "updateAdvisorySettings").mockImplementation(async (data) => ({
      level: data.level,
      allowlist: [],
    })),
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
    // Every section has a readable label, never its raw id.
    expect(await screen.findByText("Up Next")).toBeDefined();
    expect(screen.getByText("Trending Now")).toBeDefined();
    expect(screen.queryByText("trending")).toBeNull();
  });

  it("shows crowded week section", async () => {
    const client = newTestClient();
    render(<AppearanceTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      // crowded week toggle renders an aria-pressed button
      expect(
        screen.getAllByRole("button", { pressed: true }).length,
      ).toBeGreaterThan(0);
    });
  });

  it("explains each content advisory level", async () => {
    const client = newTestClient();
    render(<AppearanceTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByText("Content advisory")).toBeDefined();
    });
    expect(screen.getByRole("radio", { name: /off/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /mild/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /moderate/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /strict/i })).toBeDefined();
    expect(
      screen.getByText(/Hide or blur titles above a maturity threshold/i),
    ).toBeDefined();
    expect(
      screen.getByText(/Blur titles rated R, TV-MA, or NC-17/i),
    ).toBeDefined();
    expect(
      screen.getByText(/Hide titles rated R, TV-MA, or NC-17 from Calendar/i),
    ).toBeDefined();
    expect(screen.getByText(/Hide PG-13, TV-14, and above/i)).toBeDefined();
    expect(screen.getByText(/Nothing is deleted/i)).toBeDefined();
  });

  it("only offers display preferences that do something (#1415)", async () => {
    render(<AppearanceTab />, { wrapper: wrapper(newTestClient()) });

    await screen.findByRole("switch", { name: /reduce motion/i });
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    expect(screen.queryByText(/spoiler/i)).toBeNull();
    expect(screen.queryByText(/auto-play trailers/i)).toBeNull();
  });

  it("names the crowded week toggle", async () => {
    render(<AppearanceTab />, { wrapper: wrapper(newTestClient()) });

    const toggle = await screen.findByRole("button", {
      name: "Show crowded week badges",
    });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  describe("language picker", () => {
    afterEach(async () => {
      localStorage.removeItem(LANGUAGE_STORAGE_KEY);
      await i18n.changeLanguage("en");
    });

    it("lists every supported language and marks the active one", async () => {
      render(<AppearanceTab />, { wrapper: wrapper(newTestClient()) });

      const group = await screen.findByRole("group", { name: "Language" });
      const buttons = Array.from(group.querySelectorAll("button"));
      expect(buttons.map((b) => b.getAttribute("lang"))).toEqual([
        "en",
        "es",
        "de",
        "fr",
        "pt",
        "ja",
      ]);
      expect(
        screen
          .getByRole("button", { name: /English/ })
          .getAttribute("aria-pressed"),
      ).toBe("true");
      expect(
        screen
          .getByRole("button", { name: /Deutsch/ })
          .getAttribute("aria-pressed"),
      ).toBe("false");
    });

    it("switches the UI language and saves it to the account", async () => {
      const updateSpy = spyOn(api, "updateMyProfile").mockResolvedValue({
        display_name: null,
        bio: null,
        country_code: null,
        locale: "es",
      });
      spies.push(updateSpy);
      render(<AppearanceTab />, { wrapper: wrapper(newTestClient()) });

      fireEvent.click(await screen.findByRole("button", { name: /Español/ }));

      await waitFor(() => {
        expect(screen.getByRole("group", { name: "Idioma" })).toBeDefined();
      });
      expect(
        screen
          .getByRole("button", { name: /Español/ })
          .getAttribute("aria-pressed"),
      ).toBe("true");
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("es");
      expect(updateSpy).toHaveBeenCalledWith({ locale: "es" });
    });

    it("keeps the new language when saving to the account fails", async () => {
      spies.push(
        spyOn(api, "updateMyProfile").mockRejectedValue(new Error("offline")),
      );
      render(<AppearanceTab />, { wrapper: wrapper(newTestClient()) });

      fireEvent.click(await screen.findByRole("button", { name: /Deutsch/ }));

      await waitFor(() => {
        expect(screen.getByRole("group", { name: "Sprache" })).toBeDefined();
      });
      expect(i18n.language).toBe("de");
    });
  });
});

it("shows an unsaved error after a save fails, then retries and clears it", async () => {
  const update = spyOn(api, "updateAppearanceSettings")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({
      themeVariant: "dark",
      accentColor: "amber",
      density: "comfortable",
      reduceMotion: 0,
      highContrast: 0,
      hideEpisodeSpoilers: 0,
      autoplayTrailers: 0,
    });
  spies.push(update);
  const client = newTestClient();
  render(<AppearanceTab />, { wrapper: wrapper(client) });
  fireEvent.click(await screen.findByTestId("accent-picker"));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Changes are not saved",
  );
  expect(screen.queryByText("Saved")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(update).toHaveBeenCalledTimes(2);
});
it("retains failed homepage changes explicitly unsaved and retries the same layout", async () => {
  let attempts = 0;
  const update = spyOn(api, "updateHomepageLayout").mockImplementation(
    async (layout) => {
      if (attempts++ === 0) throw new Error("offline");
      return { homepage_layout: layout };
    },
  );
  spies.push(update);
  render(<AppearanceTab />, { wrapper: wrapper(newTestClient()) });
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: /hide section/i }),
    ).toHaveLength(2),
  );
  fireEvent.click(screen.getAllByRole("button", { name: /hide section/i })[0]);
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Changes are not saved",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
  expect(update.mock.calls[1][0]).toEqual(update.mock.calls[0][0]);
});
