import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { SFormRow, SInput, SLabel, SSwitch, SToggle } from "./kit";

afterEach(() => {
  cleanup();
});

describe("SFormRow a11y", () => {
  it("renders a <label> with htmlFor matching the child SInput id", () => {
    render(
      <SFormRow label="Username">
        <SInput value="alice" />
      </SFormRow>,
    );

    const label = screen.getByText("Username").closest("label");
    expect(label).not.toBeNull();
    const htmlFor = label?.getAttribute("for");
    expect(htmlFor).toBeTruthy();

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

    const label = screen.getByText("Schedule").closest("label");
    expect(label).not.toBeNull();
    const htmlFor = label?.getAttribute("for");
    expect(htmlFor).toBeTruthy();

    const select = document.getElementById(htmlFor!);
    expect(select?.tagName.toLowerCase()).toBe("select");

    expect(screen.getByText("Covers the next 7 days")).not.toBeNull();
  });
});

describe("SLabel a11y", () => {
  it("renders a <div> when no htmlFor is given", () => {
    const { container } = render(<SLabel>Standalone label text</SLabel>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.tagName.toLowerCase()).toBe("div");
  });

  it("renders a <label> element when htmlFor is provided", () => {
    const { container } = render(
      <SLabel htmlFor="my-test-input">Field name here</SLabel>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.tagName.toLowerCase()).toBe("label");
    expect(wrapper.getAttribute("for")).toBe("my-test-input");
  });
});

describe("SSwitch", () => {
  it("renders a switch button with a non-empty aria-labelledby pointing to the label element", () => {
    render(
      <SSwitch label="Enable notifications" on={false} onChange={() => {}} />,
    );

    const switchBtn = screen.getByRole("switch");
    expect(switchBtn).toBeDefined();

    const labelledById = switchBtn.getAttribute("aria-labelledby");
    expect(labelledById).toBeTruthy();

    const labelEl = document.getElementById(labelledById!);
    expect(labelEl).toBeDefined();
    expect(labelEl!.textContent).toBe("Enable notifications");
  });

  it("sets aria-checked to false when off", () => {
    render(<SSwitch label="Push alerts" on={false} onChange={() => {}} />);
    const switchBtn = screen.getByRole("switch");
    expect(switchBtn.getAttribute("aria-checked")).toBe("false");
  });

  it("sets aria-checked to true when on", () => {
    render(<SSwitch label="Push alerts" on={true} onChange={() => {}} />);
    const switchBtn = screen.getByRole("switch");
    expect(switchBtn.getAttribute("aria-checked")).toBe("true");
  });
});

describe("SToggle", () => {
  it("accepts aria-label and applies it to the button", () => {
    render(<SToggle on={false} aria-label="Dark mode" />);
    const btn = screen.getByRole("switch", { name: "Dark mode" });
    expect(btn).toBeDefined();
    expect(btn.getAttribute("aria-label")).toBe("Dark mode");
  });

  it("accepts aria-labelledby and applies it to the button", () => {
    render(
      <div>
        <span id="my-label">My toggle label</span>
        <SToggle on={false} aria-labelledby="my-label" />
      </div>,
    );
    const btn = screen.getByRole("switch");
    expect(btn.getAttribute("aria-labelledby")).toBe("my-label");
  });
});
