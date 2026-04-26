import { describe, it, expect } from "bun:test";
import { render } from "@testing-library/react";
import { Card } from "./card";

describe("Card", () => {
  it("renders with default variants", () => {
    const { container } = render(<Card />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("bg-zinc-900");
    expect(el.className).toContain("border-white/[0.06]");
    expect(el.className).toContain("rounded-xl");
    expect(el.className).toContain("p-4");
  });

  it("applies translucent tone", () => {
    const { container } = render(<Card tone="translucent" />);
    expect(container.firstElementChild?.className).toContain("bg-zinc-900/60");
  });

  it("applies overlay tone", () => {
    const { container } = render(<Card tone="overlay" />);
    expect(container.firstElementChild?.className).toContain("bg-zinc-900/95");
    expect(container.firstElementChild?.className).toContain("backdrop-blur-sm");
  });

  it("applies radius variants", () => {
    const { container: lg } = render(<Card radius="lg" />);
    expect(lg.firstElementChild?.className).toContain("rounded-lg");

    const { container: xl2 } = render(<Card radius="2xl" />);
    expect(xl2.firstElementChild?.className).toContain("rounded-2xl");
  });

  it("applies padding variants", () => {
    const { container: none } = render(<Card padding="none" />);
    expect(none.firstElementChild?.className).not.toContain("p-");

    const { container: sm } = render(<Card padding="sm" />);
    expect(sm.firstElementChild?.className).toContain("p-2.5");

    const { container: lg } = render(<Card padding="lg" />);
    expect(lg.firstElementChild?.className).toContain("p-6");

    const { container: xl } = render(<Card padding="xl" />);
    expect(xl.firstElementChild?.className).toContain("p-8");
  });

  it("merges className onto variants", () => {
    const { container } = render(<Card className="my-custom-class" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("my-custom-class");
    expect(el.className).toContain("bg-zinc-900");
  });

  it("forwards HTML attributes", () => {
    const { getByTestId } = render(<Card data-testid="test-card" role="region" />);
    const el = getByTestId("test-card");
    expect(el.getAttribute("role")).toBe("region");
  });

  it("renders children", () => {
    const { getByText } = render(<Card>Hello card</Card>);
    expect(getByText("Hello card")).toBeTruthy();
  });
});
