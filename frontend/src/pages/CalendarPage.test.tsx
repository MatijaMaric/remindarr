import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

// Initialize i18n before anything else (avoids mock.module leak)
import "../i18n";

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
  getCrowdedWeekSettings: mock(() =>
    Promise.resolve({ crowdedWeekThreshold: 5, crowdedWeekBadgeEnabled: 1 })
  ),
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

    // Grid weekday headers should be gone, date picker trigger should be visible
    expect(screen.queryByText("Mon")).toBeNull();
    // Agenda mode shows a date picker trigger button
    const today = new Date();
    const dateLabel = today.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    expect(screen.getByText(dateLabel)).toBeDefined();
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

  it("view toggle buttons have aria-label attributes", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    const gridBtn = screen.getByRole("button", { name: /grid view/i });
    const agendaBtn = screen.getByRole("button", { name: /agenda view/i });
    expect(gridBtn).toBeDefined();
    expect(agendaBtn).toBeDefined();
  });

  it("view toggle buttons have correct aria-pressed state", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Default is grid view
    expect(screen.getByRole("button", { name: /grid view/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /agenda view/i }).getAttribute("aria-pressed")).toBe("false");

    // Switch to agenda
    fireEvent.click(screen.getByRole("button", { name: /agenda view/i }));

    // Re-query after state update
    expect(screen.getByRole("button", { name: /grid view/i }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /agenda view/i }).getAttribute("aria-pressed")).toBe("true");
  });

  it("hide watched button has aria-label attribute", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Switch to agenda to show hide-watched toggle
    fireEvent.click(screen.getByTitle("Agenda view"));

    const toggle = screen.getByRole("button", { name: /hide watched/i });
    expect(toggle).toBeDefined();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders density toggle buttons on desktop", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Density toggle renders C / C / S (compact / comfortable / spacious initials)
    const compactBtn = screen.getByRole("button", { name: /compact/i });
    const comfortableBtn = screen.getByRole("button", { name: /comfortable/i });
    const spaciousBtn = screen.getByRole("button", { name: /spacious/i });
    expect(compactBtn).toBeDefined();
    expect(comfortableBtn).toBeDefined();
    expect(spaciousBtn).toBeDefined();
  });

  it("comfortable density is active by default", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    const comfortableBtn = screen.getByRole("button", { name: /comfortable/i });
    expect(comfortableBtn.getAttribute("aria-pressed")).toBe("true");
    expect(comfortableBtn.className).toContain("bg-amber-500");
  });

  it("compact density reduces item cap vs comfortable", () => {
    render(<CalendarPage />, { wrapper: Wrapper });

    // Compact density button
    const compactBtn = screen.getByRole("button", { name: /compact/i });
    fireEvent.click(compactBtn);

    expect(compactBtn.getAttribute("aria-pressed")).toBe("true");
    expect(compactBtn.className).toContain("bg-amber-500");

    // Comfortable should no longer be active
    const comfortableBtn = screen.getByRole("button", { name: /comfortable/i });
    expect(comfortableBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("?density=compact param activates compact density", () => {
    render(
      <MemoryRouter initialEntries={["/?density=compact"]}>
        <CalendarPage />
      </MemoryRouter>
    );
    const compactBtn = screen.getByRole("button", { name: /compact/i });
    expect(compactBtn.getAttribute("aria-pressed")).toBe("true");
  });
});
