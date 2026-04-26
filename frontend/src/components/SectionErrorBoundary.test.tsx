import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "../i18n";
import SectionErrorBoundary from "./SectionErrorBoundary";

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("boom");
  return <div>content</div>;
}

afterEach(() => cleanup());

describe("SectionErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <SectionErrorBoundary label="Cast">
        <Bomb shouldThrow={false} />
      </SectionErrorBoundary>
    );
    expect(screen.getByText("content")).toBeDefined();
  });

  it("shows labeled fallback when a child throws", () => {
    const consoleError = mock(() => {});
    const original = console.error;
    console.error = consoleError;

    render(
      <SectionErrorBoundary label="Cast">
        <Bomb shouldThrow={true} />
      </SectionErrorBoundary>
    );
    expect(screen.getByText(/Couldn't load Cast/)).toBeDefined();
    expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();

    console.error = original;
  });

  it("calls onRetry prop when Retry is clicked", () => {
    const consoleError = mock(() => {});
    const original = console.error;
    console.error = consoleError;

    const onRetry = mock(() => {});
    render(
      <SectionErrorBoundary label="Ratings" onRetry={onRetry}>
        <Bomb shouldThrow={true} />
      </SectionErrorBoundary>
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    console.error = original;
  });
});
