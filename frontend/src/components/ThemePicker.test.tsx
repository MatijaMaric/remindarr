import { describe, it, expect, afterEach, mock, spyOn } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "../i18n";
import ThemePicker from "./ThemePicker";
import * as useThemeModule from "../hooks/useTheme";

afterEach(() => {
  cleanup();
});

describe("ThemePicker", () => {
  it("renders all 7 theme buttons", () => {
    const spy = spyOn(useThemeModule, "useTheme").mockReturnValue({
      theme: "dark",
      setTheme: mock(() => {}),
    });

    render(<ThemePicker />);

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

    render(<ThemePicker />);

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

    render(<ThemePicker />);
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

    render(<ThemePicker />);
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

    render(<ThemePicker />);
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(setTheme).toHaveBeenCalledWith("dark");

    spy.mockRestore();
  });

  it("active button is amber for light theme", () => {
    const spy = spyOn(useThemeModule, "useTheme").mockReturnValue({
      theme: "light",
      setTheme: mock(() => {}),
    });

    render(<ThemePicker />);
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

    render(<ThemePicker />);
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

    render(<ThemePicker />);
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

    render(<ThemePicker />);
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    expect(setTheme).toHaveBeenCalledWith("auto");

    spy.mockRestore();
  });
});
