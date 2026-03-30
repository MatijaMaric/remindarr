import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import MultiSelectDropdown from "./MultiSelectDropdown";

// Mock react-i18next
mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "filter.search": "Search...",
      };
      return translations[key] ?? key;
    },
    i18n: { language: "en" },
  }),
}));

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Charlie" },
  { value: "d", label: "Delta" },
];

describe("MultiSelectDropdown", () => {
  it("renders button with label when nothing selected", () => {
    render(
      <MultiSelectDropdown label="Pick one" options={OPTIONS} selected={[]} onChange={() => {}} />,
    );
    expect(screen.getByText("Pick one")).toBeDefined();
  });

  it("shows selected items in summary", () => {
    render(
      <MultiSelectDropdown label="Pick one" options={OPTIONS} selected={["a"]} onChange={() => {}} />,
    );
    expect(screen.getByText("Alpha")).toBeDefined();
  });

  it("shows count when 3+ items selected", () => {
    render(
      <MultiSelectDropdown label="Pick" options={OPTIONS} selected={["a", "b", "c"]} onChange={() => {}} />,
    );
    expect(screen.getByText("3 selected")).toBeDefined();
  });

  it("opens dropdown and shows search input on click", () => {
    render(
      <MultiSelectDropdown label="Pick" options={OPTIONS} selected={[]} onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByPlaceholderText("Search...")).toBeDefined();
  });

  it("filters options by search query", () => {
    render(
      <MultiSelectDropdown label="Pick" options={OPTIONS} selected={[]} onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button"));
    const searchInput = screen.getByPlaceholderText("Search...");
    fireEvent.change(searchInput, { target: { value: "alp" } });

    // Alpha should be visible
    expect(screen.getByText("Alpha")).toBeDefined();
    // Beta should not be visible
    expect(screen.queryByText("Beta")).toBeNull();
  });

  it("renders sections with dividers", () => {
    const sections = [
      { label: "Group A", options: [{ value: "a", label: "Alpha" }] },
      { label: "Group B", options: [{ value: "b", label: "Beta" }] },
    ];
    render(
      <MultiSelectDropdown label="Pick" sections={sections} selected={[]} onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Group A")).toBeDefined();
    expect(screen.getByText("Group B")).toBeDefined();
    expect(screen.getByText("Alpha")).toBeDefined();
    expect(screen.getByText("Beta")).toBeDefined();
  });

  it("hides section headers during search", () => {
    const sections = [
      { label: "Group A", options: [{ value: "a", label: "Alpha" }] },
      { label: "Group B", options: [{ value: "b", label: "Beta" }] },
    ];
    render(
      <MultiSelectDropdown label="Pick" sections={sections} selected={[]} onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button"));
    const searchInput = screen.getByPlaceholderText("Search...");
    fireEvent.change(searchInput, { target: { value: "alp" } });

    expect(screen.getByText("Alpha")).toBeDefined();
    // Section headers should be hidden during search
    expect(screen.queryByText("Group A")).toBeNull();
    expect(screen.queryByText("Group B")).toBeNull();
  });

  it("calls onChange when toggling an option", () => {
    const onChange = mock(() => {});
    render(
      <MultiSelectDropdown label="Pick" options={OPTIONS} selected={[]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Alpha"));
    expect(onChange).toHaveBeenCalledWith(["a"]);
  });
});
