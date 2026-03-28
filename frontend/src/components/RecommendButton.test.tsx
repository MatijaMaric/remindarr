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

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "sendRecommendation").mockResolvedValue({ id: "rec-1" }),
    spyOn(api, "checkRecommendation").mockResolvedValue({ recommended: false, id: null }),
    spyOn(api, "deleteRecommendation").mockResolvedValue(undefined as any),
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
  it("renders Recommend button when authenticated", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /recommend/i });
      expect(button).toBeDefined();
      expect(button.textContent).toContain("Recommend");
    });
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

  it("shows Recommended state when already recommended", async () => {
    (api.checkRecommendation as any).mockResolvedValueOnce({ recommended: true, id: "rec-1" });

    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /recommended/i });
      expect(button.textContent).toContain("Recommended");
    });
  });

  it("opens dialog when clicked and not yet recommended", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /recommend/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByText("Recommend this title")).toBeDefined();
    });
  });

  it("shows message textarea in dialog (no user picker)", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /recommend/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("recommend-message")).toBeDefined();
      // User search input should NOT exist
      expect(screen.queryByTestId("user-search-input")).toBeNull();
    });
  });

  it("calls sendRecommendation with titleId and message", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /recommend/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("recommend-message")).toBeDefined();
    });

    const textarea = screen.getByTestId("recommend-message");
    fireEvent.change(textarea, { target: { value: "You should watch this!" } });

    fireEvent.click(screen.getByTestId("recommend-send"));

    await waitFor(() => {
      expect(api.sendRecommendation).toHaveBeenCalledWith("movie-123", "You should watch this!");
    });
  });

  it("shows success toast and closes dialog on successful send", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /recommend/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("recommend-send")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("recommend-send"));

    await waitFor(() => {
      expect(sonner.toast.success).toHaveBeenCalledWith("Recommendation sent!");
    });
  });

  it("shows error toast on send failure", async () => {
    (api.sendRecommendation as any).mockRejectedValueOnce(new Error("Failed to send"));

    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /recommend/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("recommend-send")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("recommend-send"));

    await waitFor(() => {
      expect(sonner.toast.error).toHaveBeenCalledWith("Failed to send");
    });
  });

  it("sends recommendation without message when message is empty", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /recommend/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("recommend-send")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("recommend-send"));

    await waitFor(() => {
      expect(api.sendRecommendation).toHaveBeenCalledWith("movie-123", undefined);
    });
  });

  it("toggles to Recommended state after successful send", async () => {
    render(<RecommendButton titleId="movie-123" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /recommend/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /recommend/i }));

    await waitFor(() => {
      expect(screen.getByTestId("recommend-send")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("recommend-send"));

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /recommended/i });
      expect(button.textContent).toContain("Recommended");
    });
  });
});
