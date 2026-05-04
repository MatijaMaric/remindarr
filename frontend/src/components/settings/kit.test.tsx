import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SFormRow, SInput, SLabel } from "./kit";

describe("SFormRow a11y", () => {
  it("renders a <label> with htmlFor matching the child SInput id", () => {
    render(
      <SFormRow label="Username">
        <SInput value="alice" />
      </SFormRow>,
    );

    // The label element must exist and have a non-empty htmlFor
    const label = screen.getByText("Username").closest("label");
    expect(label).not.toBeNull();
    const htmlFor = label?.getAttribute("for");
    expect(htmlFor).toBeTruthy();

    // The input associated with the label must exist in the DOM
    const input = document.getElementById(htmlFor!);
    expect(input).not.toBeNull();
    expect(input?.tagName.toLowerCase()).toBe("input");
  });

  it("renders a <label> with htmlFor matching a native <select> id", () => {
    render(
      <SFormRow label="Country">
        <select>
          <option value="">None</option>
          <option value="US">United States</option>
        </select>
      </SFormRow>,
    );

    const label = screen.getByText("Country").closest("label");
    expect(label).not.toBeNull();
    const htmlFor = label?.getAttribute("for");
    expect(htmlFor).toBeTruthy();

    const select = document.getElementById(htmlFor!);
    expect(select).not.toBeNull();
    expect(select?.tagName.toLowerCase()).toBe("select");
  });

  it("renders a <label> with htmlFor matching a native <textarea> id", () => {
    render(
      <SFormRow label="Bio">
        <textarea />
      </SFormRow>,
    );

    const label = screen.getByText("Bio").closest("label");
    expect(label).not.toBeNull();
    const htmlFor = label?.getAttribute("for");
    expect(htmlFor).toBeTruthy();

    const textarea = document.getElementById(htmlFor!);
    expect(textarea).not.toBeNull();
    expect(textarea?.tagName.toLowerCase()).toBe("textarea");
  });

  it("still renders when SFormRow has multiple children (control + hint)", () => {
    render(
      <SFormRow label="Schedule">
        <select>
          <option value="daily">Daily</option>
        </select>
        <div>Covers the next 7 days</div>
      </SFormRow>,
    );

    // Label should still point to the select (first child)
    const label = screen.getByText("Schedule").closest("label");
    expect(label).not.toBeNull();
    const htmlFor = label?.getAttribute("for");
    expect(htmlFor).toBeTruthy();

    const select = document.getElementById(htmlFor!);
    expect(select?.tagName.toLowerCase()).toBe("select");

    // Hint text must still be rendered
    expect(screen.getByText("Covers the next 7 days")).not.toBeNull();
  });
});

describe("SLabel a11y", () => {
  it("renders a <div> when no htmlFor is given", () => {
    const { container } = render(<SLabel>Standalone label text</SLabel>);
    // The outer wrapper should be a div, not a label
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.tagName.toLowerCase()).toBe("div");
  });

  it("renders a <label> element when htmlFor is provided", () => {
    const { container } = render(<SLabel htmlFor="my-test-input">Field name here</SLabel>);
    // The outer wrapper should be a label element
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.tagName.toLowerCase()).toBe("label");
    expect(wrapper.getAttribute("for")).toBe("my-test-input");
  });
});
