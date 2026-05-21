import { describe, test, expect, spyOn, afterEach, beforeEach, mock } from "bun:test";
import { render, screen, waitFor, cleanup, act, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";

const { default: UserSearchDropdown } = await import("./UserSearchDropdown");

function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>{children}</QueryClientProvider>
  );
}

const mockUsers = [
  { id: "u1", username: "alice", display_name: "Alice", image: null },
  { id: "u2", username: "bob", display_name: null, image: null },
];

let searchUsersSpy: ReturnType<typeof spyOn<typeof api, "searchUsers">>;

beforeEach(() => {
  searchUsersSpy = spyOn(api, "searchUsers").mockResolvedValue({ users: mockUsers });
});

afterEach(() => {
  searchUsersSpy.mockRestore();
  cleanup();
});

describe("UserSearchDropdown", () => {
  test("renders search input", () => {
    render(
      <UserSearchDropdown onSelect={mock(() => {})} />,
      { wrapper: Wrapper }
    );

    expect(screen.getByTestId("user-search-input")).toBeDefined();
  });

  test("no dropdown shown on empty input", () => {
    render(
      <UserSearchDropdown onSelect={mock(() => {})} />,
      { wrapper: Wrapper }
    );

    expect(screen.queryByTestId("user-search-results")).toBeNull();
  });

  test("shows results after typing (bypassing debounce via input change)", async () => {
    // The query triggers after debounce — we type and wait
    searchUsersSpy.mockResolvedValue({ users: mockUsers });

    render(
      <UserSearchDropdown onSelect={mock(() => {})} />,
      { wrapper: Wrapper }
    );

    const input = screen.getByTestId("user-search-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "alice" } });
      // Wait past debounce delay
      await new Promise((r) => setTimeout(r, 350));
    });

    await waitFor(() => {
      expect(screen.getByTestId("user-search-results")).toBeDefined();
    });

    expect(screen.getByText("Alice")).toBeDefined();
  });
});
