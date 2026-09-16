import { afterEach, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { Pill } from "./Pill";

afterEach(cleanup);

it("exposes pressed state only when the Pill has an active state", () => {
  const { rerender } = render(<Pill>Action</Pill>);
  expect(
    screen.getByRole("button", { name: "Action" }).hasAttribute("aria-pressed"),
  ).toBe(false);
  rerender(<Pill active={false}>Toggle</Pill>);
  expect(
    screen.getByRole("button", { name: "Toggle", pressed: false }),
  ).toBeDefined();
  rerender(<Pill active>Toggle</Pill>);
  expect(
    screen.getByRole("button", { name: "Toggle", pressed: true }),
  ).toBeDefined();
});
