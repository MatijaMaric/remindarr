import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import InstallPrompt from "./InstallPrompt";
import { AuthContext } from "../context/AuthContext";
import * as useInstallPromptModule from "../hooks/useInstallPrompt";

const mockUser = {
  id: "1",
  username: "test",
  display_name: null,
  auth_provider: "local",
  is_admin: false,
};

const mockAuthValue = {
  user: mockUser,
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
  signup: mock(() => Promise.resolve()),
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthContext value={mockAuthValue as any}>{children}</AuthContext>
  );
}

function NoUserWrapper({ children }: { children: ReactNode }) {
  return (
    <AuthContext value={{ ...mockAuthValue, user: null } as any}>
      {children}
    </AuthContext>
  );
}

const mockPromptInstall = mock(() => Promise.resolve());
const mockDismiss = mock(() => {});

let hookSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  hookSpy = spyOn(useInstallPromptModule, "useInstallPrompt").mockReturnValue({
    canInstall: true,
    promptInstall: mockPromptInstall,
    dismiss: mockDismiss,
  });
});

afterEach(() => {
  cleanup();
  hookSpy.mockRestore();
  mockPromptInstall.mockClear();
  mockDismiss.mockClear();
});

describe("InstallPrompt", () => {
  it("renders banner when user is logged in and canInstall is true", () => {
    render(<InstallPrompt />, { wrapper: Wrapper });
    expect(
      screen.getByText("Install Remindarr for a better experience"),
    ).toBeDefined();
  });

  it("renders nothing when user is not logged in", () => {
    const { container } = render(<InstallPrompt />, {
      wrapper: NoUserWrapper,
    });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when canInstall is false", () => {
    hookSpy.mockReturnValue({
      canInstall: false,
      promptInstall: mockPromptInstall,
      dismiss: mockDismiss,
    });

    const { container } = render(<InstallPrompt />, { wrapper: Wrapper });
    expect(container.innerHTML).toBe("");
  });

  it("calls promptInstall when Install button is clicked", () => {
    render(<InstallPrompt />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText("Install"));
    expect(mockPromptInstall).toHaveBeenCalledTimes(1);
  });

  it("calls dismiss when X button is clicked", () => {
    render(<InstallPrompt />, { wrapper: Wrapper });
    fireEvent.click(screen.getByLabelText("Dismiss install prompt"));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("has accessible banner role", () => {
    render(<InstallPrompt />, { wrapper: Wrapper });
    expect(screen.getByRole("banner")).toBeDefined();
  });
});
