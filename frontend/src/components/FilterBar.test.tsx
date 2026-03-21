import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FilterBar from "./FilterBar";

afterEach(() => {
  cleanup();
});

describe("FilterBar", () => {
  const defaultProps = {
    type: [] as string[],
    onTypeChange: mock(() => {}),
  };

  it("renders type toggle buttons (All, Movies, Shows)", () => {
    render(<FilterBar {...defaultProps} />);

    expect(screen.getByRole("button", { name: "All" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Movies" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Shows" })).toBeDefined();
  });

  it("calls onTypeChange with empty array when 'All' is clicked", () => {
    const onTypeChange = mock(() => {});
    render(<FilterBar {...defaultProps} onTypeChange={onTypeChange} />);

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onTypeChange).toHaveBeenCalledWith([]);
  });

  it("calls onTypeChange with MOVIE when 'Movies' is clicked from empty", () => {
    const onTypeChange = mock(() => {});
    render(<FilterBar {...defaultProps} type={[]} onTypeChange={onTypeChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Movies" }));
    expect(onTypeChange).toHaveBeenCalledWith(["MOVIE"]);
  });

  it("calls onTypeChange to deselect when clicking already selected type", () => {
    const onTypeChange = mock(() => {});
    render(<FilterBar {...defaultProps} type={["MOVIE"]} onTypeChange={onTypeChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Movies" }));
    expect(onTypeChange).toHaveBeenCalledWith([]);
  });

  it("normalizes to empty when both types are selected", () => {
    const onTypeChange = mock(() => {});
    render(<FilterBar {...defaultProps} type={["MOVIE"]} onTypeChange={onTypeChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Shows" }));
    expect(onTypeChange).toHaveBeenCalledWith([]);
  });

  it("renders days filter when showDaysFilter is true", () => {
    const onDaysBackChange = mock(() => {});
    render(
      <FilterBar
        {...defaultProps}
        showDaysFilter={true}
        daysBack={30}
        onDaysBackChange={onDaysBackChange}
      />
    );

    expect(screen.getByRole("button", { name: "7d" })).toBeDefined();
    expect(screen.getByRole("button", { name: "14d" })).toBeDefined();
    expect(screen.getByRole("button", { name: "30d" })).toBeDefined();
    expect(screen.getByRole("button", { name: "90d" })).toBeDefined();
  });

  it("does not render days filter when showDaysFilter is false", () => {
    render(<FilterBar {...defaultProps} showDaysFilter={false} />);

    expect(screen.queryByRole("button", { name: "7d" })).toBeNull();
  });

  it("calls onDaysBackChange when a day button is clicked", () => {
    const onDaysBackChange = mock(() => {});
    render(
      <FilterBar
        {...defaultProps}
        showDaysFilter={true}
        daysBack={30}
        onDaysBackChange={onDaysBackChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    expect(onDaysBackChange).toHaveBeenCalledWith(7);
  });

  it("renders genre dropdown when genres are provided", () => {
    const onGenreChange = mock(() => {});
    render(
      <FilterBar
        {...defaultProps}
        genres={["Action", "Comedy"]}
        genre={[]}
        onGenreChange={onGenreChange}
      />
    );

    // Real MultiSelectDropdown renders a button with the label text
    expect(screen.getByRole("button", { name: "All Genres" })).toBeDefined();
  });

  it("renders provider dropdown when providers are provided", () => {
    const onProviderChange = mock(() => {});
    render(
      <FilterBar
        {...defaultProps}
        providers={[
          { id: 1, name: "Netflix" },
          { id: 2, name: "Disney+" },
        ]}
        provider={[]}
        onProviderChange={onProviderChange}
      />
    );

    expect(screen.getByRole("button", { name: "All Platforms" })).toBeDefined();
  });

  it("renders Hide Tracked button when handler provided", () => {
    const onHideTrackedChange = mock(() => {});
    render(
      <FilterBar
        {...defaultProps}
        hideTracked={false}
        onHideTrackedChange={onHideTrackedChange}
      />
    );

    const btn = screen.getByRole("button", { name: "Hide Tracked" });
    expect(btn).toBeDefined();

    fireEvent.click(btn);
    expect(onHideTrackedChange).toHaveBeenCalledWith(true);
  });

  it("shows Clear filters button when filters are active", () => {
    const onClearFilters = mock(() => {});
    render(
      <FilterBar
        {...defaultProps}
        type={["MOVIE"]}
        onClearFilters={onClearFilters}
      />
    );

    const btn = screen.getByRole("button", { name: "Clear filters" });
    expect(btn).toBeDefined();

    fireEvent.click(btn);
    expect(onClearFilters).toHaveBeenCalled();
  });

  it("hides Clear filters button when no filters are active", () => {
    const onClearFilters = mock(() => {});
    render(
      <FilterBar
        {...defaultProps}
        type={[]}
        onClearFilters={onClearFilters}
      />
    );

    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("type toggle buttons have correct aria-pressed when nothing selected", () => {
    render(<FilterBar {...defaultProps} type={[]} />);

    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Movies" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Shows" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("type toggle buttons have correct aria-pressed when Movies selected", () => {
    render(<FilterBar {...defaultProps} type={["MOVIE"]} />);

    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Movies" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Shows" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("days buttons have correct aria-pressed for selected day", () => {
    const onDaysBackChange = mock(() => {});
    render(
      <FilterBar
        {...defaultProps}
        showDaysFilter={true}
        daysBack={30}
        onDaysBackChange={onDaysBackChange}
      />
    );

    expect(screen.getByRole("button", { name: "30d" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "7d" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("type toggle group has accessible group label", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByRole("group", { name: "Content type" })).toBeDefined();
  });

  it("days filter group has accessible group label", () => {
    const onDaysBackChange = mock(() => {});
    render(
      <FilterBar
        {...defaultProps}
        showDaysFilter={true}
        daysBack={30}
        onDaysBackChange={onDaysBackChange}
      />
    );
    expect(screen.getByRole("group", { name: "Time period" })).toBeDefined();
  });
});
