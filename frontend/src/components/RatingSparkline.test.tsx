import { describe, expect, it } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "bun:test";
import RatingSparkline from "./RatingSparkline";

afterEach(() => cleanup());

describe("RatingSparkline", () => {
  it("renders nothing when there are no rated episodes", () => {
    const { container } = render(<RatingSparkline points={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows a tooltip on each point in S{season}E{episode}: {rating} form", () => {
    render(
      <RatingSparkline
        points={[
          { season: 1, episode: 1, rating: "LOVE" },
          { season: 1, episode: 5, rating: "DISLIKE" },
          { season: 2, episode: 3, rating: "LIKE" },
        ]}
      />,
    );

    expect(screen.getByText("S1E1: LOVE")).toBeDefined();
    expect(screen.getByText("S1E5: DISLIKE")).toBeDefined();
    expect(screen.getByText("S2E3: LIKE")).toBeDefined();
    expect(
      screen.getByRole("img", { name: "Episode rating pacing" }),
    ).toBeDefined();
  });

  it("renders an optional heading", () => {
    render(
      <RatingSparkline
        heading="Pacing"
        points={[{ season: 1, episode: 1, rating: "LIKE" }]}
      />,
    );
    expect(screen.getByText("Pacing")).toBeDefined();
  });
});
