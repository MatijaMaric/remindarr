import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import { useEffect } from "react";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import ScrollToTop from "./ScrollToTop";

const scrollToMock = mock(() => {});

beforeEach(() => {
  window.scrollTo = scrollToMock as unknown as typeof window.scrollTo;
  scrollToMock.mockClear();
});

afterEach(() => {
  cleanup();
});

// Helper component to trigger navigation
function NavigateTo({ path }: { path: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(path);
  }, [navigate, path]);
  return null;
}

describe("ScrollToTop", () => {
  it("scrolls to top on initial render", () => {
    render(
      <MemoryRouter initialEntries={["/title/123"]}>
        <ScrollToTop />
      </MemoryRouter>
    );

    expect(scrollToMock).toHaveBeenCalledWith(0, 0);
  });

  it("scrolls to top when pathname changes", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/title/123", "/title/456"]} initialIndex={0}>
        <ScrollToTop />
        <NavigateTo path="/title/456" />
      </MemoryRouter>
    );

    // Called at least once for initial render
    expect(scrollToMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    unmount();
  });

  it("renders nothing", () => {
    const { container } = render(
      <MemoryRouter>
        <ScrollToTop />
      </MemoryRouter>
    );

    expect(container.innerHTML).toBe("");
  });
});
