import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  mock,
  spyOn,
} from "bun:test";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import "../i18n";
import ThemePicker from "./ThemePicker";
import * as useThemeModule from "../hooks/useTheme";
import * as api from "../api";
import type { AppearanceSettings } from "../types";

const mockAppearance: AppearanceSettings = {
  themeVariant: "dark",
  accentColor: "indigo",
  density: "comfortable",
  reduceMotion: 0,
  highContrast: 0,
  hideEpisodeSpoilers: 0,
  autoplayTrailers: 0,
};

let apiSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  apiSpy = spyOn(api, "updateAppearanceSettings").mockResolvedValue(
    mockAppearance,
  );
});

afterEach(() => {
  cleanup();
  apiSpy.mockRestore();
});

describe("ThemePicker", () => {
  it("renders all 7 theme buttons", () => {
    const spy = spyOn(useThemeModule, "useTheme").mockReturnValue({
      theme: "dark",
      setTheme: mock(() => {}),
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemePicker />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Dark" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Light" })).toBeDefined();
    expect(screen.getByRole("button", { name: "OLED" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Midnight" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Moss" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Plum" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Auto" })).toBeDefined();

    spy.mockRestore();
  });

  it("active theme button has amber styling and aria-pressed=true", () => {
    const spy = spyOn(useThemeModule, "useTheme").mockReturnValue({
      theme: "dark",
      setTheme: mock(() => {}),
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemePicker />
      </QueryClientProvider>,
    );

    const activeButton = screen.getByRole("button", { name: "Dark" });
    expect(activeButton.getAttribute("aria-pressed")).toBe("true");
    expect(activeButton.className).toContain("amber-400");

    const inactiveButton = screen.getByRole("button", { name: "Light" });
    expect(inactiveButton.getAttribute("aria-pressed")).toBe("false");
    expect(inactiveButton.className).not.toContain("amber-400/");

    spy.mockRestore();
  });

  it("clicking Light calls setTheme with 'light'", () => {
    const setTheme = mock(() => {});
    const spy = spyOn(useThemeModule, "useTheme").mockReturnValue({
      theme: "dark",
      setTheme,
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemePicker />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(setTheme).toHaveBeenCalledWith("light");

    spy.mockRestore();
  });

  it("clicking OLED calls setTheme with 'oled'", () => {
    const setTheme = mock(() => {});
    const spy = spyOn(useThemeModule, "useTheme").mockReturnValue({
      theme: "dark",
      setTheme,
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemePicker />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "OLED" }));
    expect(setTheme).toHaveBeenCalledWith("oled");

    spy.mockRestore();
  });

  it("clicking Dark calls setTheme with 'dark'", () => {
    const setTheme = mock(() => {});
    const spy = spyOn(useThemeModule, "useTheme").mockReturnValue({
      theme: "light",
      setTheme,
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemePicker />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(setTheme).toHaveBeenCalledWith("dark");

    spy.mockRestore();
  });

  it("active button is amber for light theme", () => {
    const spy = spyOn(useThemeModule, "useTheme").mockReturnValue({
      theme: "light",
      setTheme: mock(() => {}),
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemePicker />
      </QueryClientProvider>,
    );
    const activeButton = screen.getByRole("button", { name: "Light" });
    expect(activeButton.getAttribute("aria-pressed")).toBe("true");
    expect(activeButton.className).toContain("amber-400");

    spy.mockRestore();
  });

  it("active button is amber for oled theme", () => {
    const spy = spyOn(useThemeModule, "useTheme").mockReturnValue({
      theme: "oled",
      setTheme: mock(() => {}),
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemePicker />
      </QueryClientProvider>,
    );
    const activeButton = screen.getByRole("button", { name: "OLED" });
    expect(activeButton.getAttribute("aria-pressed")).toBe("true");
    expect(activeButton.className).toContain("amber-400");

    spy.mockRestore();
  });

  it("clicking Midnight calls setTheme with 'midnight'", () => {
    const setTheme = mock(() => {});
    const spy = spyOn(useThemeModule, "useTheme").mockReturnValue({
      theme: "dark",
      setTheme,
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemePicker />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Midnight" }));
    expect(setTheme).toHaveBeenCalledWith("midnight");

    spy.mockRestore();
  });

  it("clicking Auto calls setTheme with 'auto'", () => {
    const setTheme = mock(() => {});
    const spy = spyOn(useThemeModule, "useTheme").mockReturnValue({
      theme: "dark",
      setTheme,
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemePicker />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    expect(setTheme).toHaveBeenCalledWith("auto");

    spy.mockRestore();
  });

  it("clicking a theme persists themeVariant to the server", () => {
    const spy = spyOn(useThemeModule, "useTheme").mockReturnValue({
      theme: "dark",
      setTheme: mock(() => {}),
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ThemePicker />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Moss" }));
    expect(apiSpy).toHaveBeenCalledWith({ themeVariant: "moss" });

    spy.mockRestore();
  });
});

it("announces an unsaved theme and retries the failed save", async () => {
  const themeSpy = spyOn(useThemeModule, "useTheme").mockReturnValue({
    theme: "dark",
    setTheme: mock(() => {}),
  });
  apiSpy.mockRejectedValueOnce(new Error("offline"));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemePicker />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Light" }));
  expect((await screen.findByRole("alert")).textContent).toContain("not saved");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  themeSpy.mockRestore();
});
