import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import "../i18n";
import RecommendButton from "./RecommendButton";
import * as api from "../api";
import * as sonner from "sonner";
import { AuthContext } from "../context/AuthContext";

const mockUser = { id: "user-1", username: "test", display_name: null, auth_provider: "local", is_admin: false };

const mockAuthValue = {
  user: mockUser,
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

function Wrapper({ children, authValue }: { children: ReactNode; authValue?: typeof mockAuthValue }) {
  return <AuthContext value={(authValue ?? mockAuthValue) as any}>{children}</AuthContext>;
}

const mockSearchResults = {
  users: [
    { id: "user-2", username: "alice", name: "Alice", display_name: "Alice", image: null },
    { id: "user-3", username: "bob", name: "Bob", display_name: "Bob", image: "https://example.com/bob.jpg" },
  ],
};

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "searchUsers").mockResolvedValue(mockSearchResults as any),
    spyOn(api, "sendRecommendation").mockResolvedValue({ id: "rec-1" }),
    spyOn(sonner.toast, "success").mockImplementation(() => "1" as any),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("RecommendButton", () => {
  it("renders Recommend button when authenticated", () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });
    const button = screen.getByRole("button", { name: /recommend/i });
    expect(button).toBeDefined();
    expect(button.textContent).toContain("Recommend");
  });

  it("returns null when not authenticated", () => {
    const noUserAuth = { ...mockAuthValue, user: null };
    const { container } = render(
      <AuthContext value={noUserAuth as any}>
        <RecommendButton titleId="movie-123" />
      </AuthContext>
    );
    expect(container.innerHTML).toBe("");
  });

  it("has correct styling classes", () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });
    const button = screen.getByRole("button", { name: /recommend/i });
    expect(button.className).toContain("bg-zinc-800");
    expect(button.className).toContain("text-zinc-400");
  });

  it("opens dialog when clicked", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByText("Recommend to a friend")).toBeDefined();
    });
  });

  it("shows user search input in dialog", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("user-search-input")).toBeDefined();
    });
  });

  it("shows user search results after typing", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("user-search-input")).toBeDefined();
    });

    const input = screen.getByTestId("user-search-input");
    fireEvent.change(input, { target: { value: "ali" } });

    await waitFor(() => {
      expect(api.searchUsers).toHaveBeenCalledWith("ali");
    });

    await waitFor(() => {
      const results = screen.getAllByTestId("user-search-result");
      expect(results.length).toBe(2);
    });
  });

  it("selects a user when clicking a result", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("user-search-input")).toBeDefined();
    });

    const input = screen.getByTestId("user-search-input");
    fireEvent.change(input, { target: { value: "ali" } });

    await waitFor(() => {
      const results = screen.getAllByTestId("user-search-result");
      expect(results.length).toBe(2);
    });

    const results = screen.getAllByTestId("user-search-result");
    fireEvent.click(results[0]);

    await waitFor(() => {
      // Selected user should show with clear button
      expect(screen.getByRole("button", { name: "Clear selection" })).toBeDefined();
      // Search input should be gone
      expect(screen.queryByTestId("user-search-input")).toBeNull();
    });
  });

  it("calls sendRecommendation on send", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("user-search-input")).toBeDefined();
    });

    // Search and select a user
    const input = screen.getByTestId("user-search-input");
    fireEvent.change(input, { target: { value: "ali" } });

    await waitFor(() => {
      const results = screen.getAllByTestId("user-search-result");
      expect(results.length).toBe(2);
    });

    fireEvent.click(screen.getAllByTestId("user-search-result")[0]);

    // Add a message
    await waitFor(() => {
      expect(screen.getByTestId("recommend-message")).toBeDefined();
    });

    const textarea = screen.getByTestId("recommend-message");
    fireEvent.change(textarea, { target: { value: "You should watch this!" } });

    // Click send
    fireEvent.click(screen.getByTestId("recommend-send"));

    await waitFor(() => {
      expect(api.sendRecommendation).toHaveBeenCalledWith("user-2", "movie-123", "You should watch this!");
    });
  });

  it("shows success toast and closes dialog on successful send", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("user-search-input")).toBeDefined();
    });

    // Select a user
    const input = screen.getByTestId("user-search-input");
    fireEvent.change(input, { target: { value: "ali" } });

    await waitFor(() => {
      const results = screen.getAllByTestId("user-search-result");
      expect(results.length).toBe(2);
    });

    fireEvent.click(screen.getAllByTestId("user-search-result")[0]);

    await waitFor(() => {
      expect(screen.getByTestId("recommend-send")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("recommend-send"));

    await waitFor(() => {
      expect(sonner.toast.success).toHaveBeenCalledWith("Recommendation sent!");
    });
  });

  it("shows error toast on send failure", async () => {
    (api.sendRecommendation as any).mockRejectedValueOnce(new Error("You must follow this user"));

    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("user-search-input")).toBeDefined();
    });

    // Select a user
    const input = screen.getByTestId("user-search-input");
    fireEvent.change(input, { target: { value: "ali" } });

    await waitFor(() => {
      const results = screen.getAllByTestId("user-search-result");
      expect(results.length).toBe(2);
    });

    fireEvent.click(screen.getAllByTestId("user-search-result")[0]);

    await waitFor(() => {
      expect(screen.getByTestId("recommend-send")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("recommend-send"));

    await waitFor(() => {
      expect(sonner.toast.error).toHaveBeenCalledWith("You must follow this user");
    });
  });

  it("send button is disabled when no user is selected", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      const sendButton = screen.getByTestId("recommend-send");
      expect(sendButton.hasAttribute("disabled")).toBe(true);
    });
  });

  it("sends recommendation without message when message is empty", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("user-search-input")).toBeDefined();
    });

    // Select a user
    const input = screen.getByTestId("user-search-input");
    fireEvent.change(input, { target: { value: "ali" } });

    await waitFor(() => {
      const results = screen.getAllByTestId("user-search-result");
      expect(results.length).toBe(2);
    });

    fireEvent.click(screen.getAllByTestId("user-search-result")[0]);

    await waitFor(() => {
      expect(screen.getByTestId("recommend-send")).toBeDefined();
    });

    // Send without message
    fireEvent.click(screen.getByTestId("recommend-send"));

    await waitFor(() => {
      expect(api.sendRecommendation).toHaveBeenCalledWith("user-2", "movie-123", undefined);
    });
  });
});
