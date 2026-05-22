import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "bun:test";
import { SettingsSidebar, type SettingsTabDef } from "./SettingsSidebar";

const tabs: SettingsTabDef[] = [
  { value: "notifications", label: "Notifications" },
  { value: "integrations", label: "Integrations" },
  { value: "account", label: "Account" },
];

afterEach(() => {
  cleanup();
});

describe("SettingsSidebar", () => {
  it("marks the active tab buttons with aria-selected=true and inactive tabs with aria-selected=false", () => {
    render(
      <SettingsSidebar tabs={tabs} active="integrations" onSelect={vi.fn()} />,
    );

    // Both mobile and desktop render in JSDOM (CSS visibility not applied).
    // Expect 2 buttons per tab label (one per nav).
    const activeButtons = screen.getAllByRole("tab", { name: "Integrations" });
    for (const btn of activeButtons) {
      expect(btn.getAttribute("aria-selected")).toBe("true");
    }

    const inactiveButtons = screen.getAllByRole("tab", {
      name: "Notifications",
    });
    for (const btn of inactiveButtons) {
      expect(btn.getAttribute("aria-selected")).toBe("false");
    }
  });

  it("renders tablist roles on nav elements with the expected accessible label", () => {
    render(
      <SettingsSidebar tabs={tabs} active="notifications" onSelect={vi.fn()} />,
    );

    // Both mobile and desktop navs have role=tablist.
    // In JSDOM both render regardless of Tailwind sm:hidden,
    // so we expect 2 tablists (mobile + desktop).
    const tablists = screen.getAllByRole("tablist", {
      name: "Settings sections",
    });
    expect(tablists.length).toBe(2);
  });

  it("calls onSelect with the tab value when a tab button is clicked", () => {
    const onSelect = vi.fn();
    render(
      <SettingsSidebar
        tabs={tabs}
        active="notifications"
        onSelect={onSelect}
      />,
    );

    // Click the first rendered "Account" tab (mobile nav).
    const accountTabs = screen.getAllByRole("tab", { name: "Account" });
    fireEvent.click(accountTabs[0]);
    expect(onSelect).toHaveBeenCalledWith("account");
  });
});
