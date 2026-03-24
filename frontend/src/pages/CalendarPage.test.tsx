import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

// Mock useIsMobile hook
let mockIsMobile = false;
mock.module("../hooks/useIsMobile", () => ({
  useIsMobile: () => mockIsMobile,
}));

// Mock API calls
mock.module("../api", () => ({
  getCalendarTitles: mock(() =>
    Promise.resolve({ titles: [], episodes: [], count: 0 })
  ),
  watchEpisode: mock(() => Promise.resolve()),
  unwatchEpisode: mock(() => Promise.resolve()),
  watchEpisodesBulk: mock(() => Promise.resolve()),
}));

// Must import after mocks
const { default: CalendarPage } = await import("./CalendarPage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mockIsMobile = false;
});

describe("CalendarPage", () => {
  it("renders grid view by default on desktop", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Grid view has weekday headers
    expect(screen.getByText("Mon")).toBeDefined();
    expect(screen.getByText("Tue")).toBeDefined();
    expect(screen.getByText("Wed")).toBeDefined();
  });

  it("renders view toggle buttons on desktop", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    expect(screen.getByTitle("Grid view")).toBeDefined();
    expect(screen.getByTitle("Agenda view")).toBeDefined();
  });

  it("switches to agenda view when agenda toggle is clicked", async () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Verify we're in grid mode (weekday headers visible)
    expect(screen.getByText("Mon")).toBeDefined();

    // Click agenda toggle
    fireEvent.click(screen.getByTitle("Agenda view"));

    // Grid weekday headers should be gone, month picker (select) should be visible
    expect(screen.queryByText("Mon")).toBeNull();
    // Agenda mode shows a select dropdown for month jumping
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThan(0);
  });

  it("switches back to grid view from agenda view", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Switch to agenda
    fireEvent.click(screen.getByTitle("Agenda view"));
    expect(screen.queryByText("Mon")).toBeNull();

    // Switch back to grid
    fireEvent.click(screen.getByTitle("Grid view"));
    expect(screen.getByText("Mon")).toBeDefined();
  });

  it("renders agenda view on mobile without toggle", () => {
    mockIsMobile = true;
    render(<CalendarPage />, { wrapper: Wrapper });

    // No toggle buttons on mobile
    expect(screen.queryByTitle("Grid view")).toBeNull();
    expect(screen.queryByTitle("Agenda view")).toBeNull();
  });

  it("shows hide watched toggle in agenda mode, selected by default", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Switch to agenda
    fireEvent.click(screen.getByTitle("Agenda view"));

    const toggle = screen.getByTitle("Show watched");
    expect(toggle).toBeDefined();
    // Active state = indigo background class
    expect(toggle.className).toContain("bg-amber-500");
  });

  it("toggles hide watched off when clicked", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Switch to agenda
    fireEvent.click(screen.getByTitle("Agenda view"));

    const toggle = screen.getByTitle("Show watched");
    fireEvent.click(toggle);

    // Now it should show "Hide watched" title (inactive state)
    const toggleOff = screen.getByTitle("Hide watched");
    expect(toggleOff).toBeDefined();
    expect(toggleOff.className).not.toContain("bg-amber-500");
  });

  it("shows hide watched toggle on mobile agenda", () => {
    mockIsMobile = true;
    render(<CalendarPage />, { wrapper: Wrapper });

    const toggle = screen.getByTitle("Show watched");
    expect(toggle).toBeDefined();
    expect(toggle.className).toContain("bg-amber-500");
  });
});
