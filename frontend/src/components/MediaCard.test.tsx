import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MediaCard } from "./MediaCard";

afterEach(cleanup);

function hasClass(container: Element, cls: string) {
  return Array.from(container.querySelectorAll("*")).some((el) => {
    const c = (el as HTMLElement).className;
    return typeof c === "string" && c.includes(cls);
  });
}

const baseProps = {
  to: "/title/abc",
  imageUrl: "https://example.com/img.jpg",
  imageAlt: "Test image",
  aspect: "poster" as const,
};

describe("MediaCard", () => {
  it("renders the image with correct src and alt when imageUrl is set", () => {
    const { getByAltText } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} />
      </MemoryRouter>,
    );
    const img = getByAltText("Test image") as HTMLImageElement;
    expect(img.src).toContain("https://example.com/img.jpg");
  });

  it("renders gradient placeholder and no img when imageUrl is null", () => {
    const { container, queryByAltText } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} imageUrl={null} />
      </MemoryRouter>,
    );
    expect(queryByAltText("Test image")).toBeNull();
    expect(hasClass(container, "from-zinc-800")).toBe(true);
  });

  it("applies aspect-video class for video aspect", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} aspect="video" />
      </MemoryRouter>,
    );
    expect(hasClass(container, "aspect-video")).toBe(true);
  });

  it("applies aspect-[2/3] class for poster aspect", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} aspect="poster" />
      </MemoryRouter>,
    );
    expect(hasClass(container, "aspect-[2/3]")).toBe(true);
  });

  it("renders neutral badge with bg-black/75 at top-right by default", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} badge={{ label: "3 new", tone: "neutral" }} />
      </MemoryRouter>,
    );
    expect(screen.getByText("3 new")).toBeTruthy();
    expect(hasClass(container, "bg-black/75")).toBe(true);
    expect(hasClass(container, "right-2")).toBe(true);
  });

  it("renders accent badge with bg-amber-400", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} badge={{ label: "in 5 days", tone: "accent" }} />
      </MemoryRouter>,
    );
    expect(screen.getByText("in 5 days")).toBeTruthy();
    expect(hasClass(container, "bg-amber-400")).toBe(true);
  });

  it("renders badge at left-2 when position is top-left", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} badge={{ label: "new", position: "top-left" }} />
      </MemoryRouter>,
    );
    expect(hasClass(container, "left-2")).toBe(true);
  });

  it("renders amber ring when unread is true", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} unread />
      </MemoryRouter>,
    );
    expect(hasClass(container, "ring-amber-500/60")).toBe(true);
  });

  it("renders unread dot when unread and no badge", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} unread />
      </MemoryRouter>,
    );
    expect(hasClass(container, "bg-amber-500")).toBe(true);
  });

  it("renders overlayAction inside the media surface", () => {
    render(
      <MemoryRouter>
        <MediaCard
          {...baseProps}
          overlayAction={<button aria-label="overlay-btn">X</button>}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "overlay-btn" })).toBeTruthy();
  });

  it("links the media image to the `to` prop", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} />
      </MemoryRouter>,
    );
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("/title/abc");
  });

  it("links the title to titleTo when provided", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard
          {...baseProps}
          title="My Title"
          titleTo="/title/abc/season/1"
        />
      </MemoryRouter>,
    );
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("/title/abc/season/1");
  });

  it("always renders chrome (bg-zinc-900)", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} />
      </MemoryRouter>,
    );
    expect(hasClass(container, "bg-zinc-900")).toBe(true);
  });

  it("renders footer content pinned below the body", () => {
    render(
      <MemoryRouter>
        <MediaCard {...baseProps} footer={<button>Mark watched</button>} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Mark watched" })).toBeTruthy();
  });

  it("omits the padded body when no title/subtitle/meta/footer are provided", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} />
      </MemoryRouter>,
    );
    expect(hasClass(container, "p-3")).toBe(false);
  });

  it("renders a progress bar with the correct inline width", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} progressPercent={60} />
      </MemoryRouter>,
    );
    const bar = container.querySelector('[style*="60%"]') as HTMLElement | null;
    expect(bar).toBeTruthy();
  });

  it("applies line-clamp-2 to title when titleClamp is 2", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} title="Long title" titleClamp={2} />
      </MemoryRouter>,
    );
    expect(hasClass(container, "line-clamp-2")).toBe(true);
  });

  it("applies truncate to title by default", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} title="Long title" />
      </MemoryRouter>,
    );
    expect(hasClass(container, "truncate")).toBe(true);
  });

  it("applies min-h-[2.5rem] to title when titleClamp is 2", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} title="Long title" titleClamp={2} />
      </MemoryRouter>,
    );
    expect(hasClass(container, "min-h-[2.5rem]")).toBe(true);
  });

  it("does not apply min-h-[2.5rem] to title when titleClamp is 1", () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard {...baseProps} title="Long title" titleClamp={1} />
      </MemoryRouter>,
    );
    expect(hasClass(container, "min-h-[2.5rem]")).toBe(false);
  });
});
