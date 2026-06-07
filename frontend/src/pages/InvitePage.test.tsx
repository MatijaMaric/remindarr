import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiMock, resetApiMock } from "../test-utils/apiMock";

// Initialize i18n before anything else
import "../i18n";

const { default: InvitePage } = await import("./InvitePage");

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function WrapperWithCode({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={["/invite?code=TESTCODE"]}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function makeInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    code: "ABC123",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    used_at: null,
    used_by: null,
    ...overrides,
  };
}

beforeEach(() => {
  apiMock.getInvitations.mockResolvedValue({
    invitations: [],
  } as never);
  apiMock.createInvitation.mockResolvedValue({
    id: "inv-new",
    code: "NEWCODE",
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  } as never);
  apiMock.revokeInvitation.mockResolvedValue(undefined as never);
  apiMock.redeemInvitation.mockResolvedValue({
    success: true,
    inviter: {
      id: "u2",
      username: "alice",
      display_name: "Alice",
      image: null,
    },
  } as never);
});

afterEach(() => {
  cleanup();
  resetApiMock();
});

describe("InvitePage", () => {
  it("renders invitation list", async () => {
    const invitations = [
      makeInvitation({ id: "inv-1", code: "CODE1" }),
      makeInvitation({ id: "inv-2", code: "CODE2" }),
    ];
    apiMock.getInvitations.mockImplementation(() =>
      Promise.resolve({ invitations } as any),
    );

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("CODE1")).toBeDefined();
      expect(screen.getByText("CODE2")).toBeDefined();
    });
  });

  it("generate button creates new invitation", async () => {
    // After creation, refresh will return the new invitation
    let callCount = 0;
    apiMock.getInvitations.mockImplementation(() => {
      callCount++;
      if (callCount > 1) {
        return Promise.resolve({
          invitations: [makeInvitation({ id: "inv-new", code: "NEWCODE" })],
        } as any);
      }
      return Promise.resolve({ invitations: [] } as any);
    });

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Create Invite Link")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Create Invite Link"));

    await waitFor(() => {
      expect(apiMock.createInvitation).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("NEWCODE")).toBeDefined();
    });
  });

  it("share button present for pending invitations", async () => {
    const invitations = [makeInvitation()];
    apiMock.getInvitations.mockImplementation(() =>
      Promise.resolve({ invitations } as any),
    );

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Share")).toBeDefined();
    });
  });

  it("revoke button works", async () => {
    const invitations = [makeInvitation({ id: "inv-1", code: "REVOKEME" })];
    let callCount = 0;
    apiMock.getInvitations.mockImplementation(() => {
      callCount++;
      if (callCount > 1) {
        return Promise.resolve({ invitations: [] } as any);
      }
      return Promise.resolve({ invitations } as any);
    });

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Revoke")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Revoke"));

    await waitFor(() => {
      expect(apiMock.revokeInvitation).toHaveBeenCalledWith("inv-1");
    });

    // Card should be removed after revoke (cache invalidated and refetched)
    await waitFor(() => {
      expect(screen.queryByText("REVOKEME")).toBeNull();
    });
  });

  it("expired invitations show correct status", async () => {
    const invitations = [
      makeInvitation({
        id: "inv-expired",
        code: "EXPIRED1",
        expires_at: new Date(Date.now() - 86400000).toISOString(),
      }),
    ];
    apiMock.getInvitations.mockImplementation(() =>
      Promise.resolve({ invitations } as any),
    );

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Expired")).toBeDefined();
    });

    // No share or revoke button for expired
    expect(screen.queryByText("Share")).toBeNull();
    expect(screen.queryByText("Revoke")).toBeNull();
  });

  it("used invitations show used by info", async () => {
    const invitations = [
      makeInvitation({
        id: "inv-used",
        code: "USED1",
        used_at: new Date().toISOString(),
        used_by: {
          id: "u3",
          username: "bob",
          display_name: "Bob",
          image: null,
        },
      }),
    ];
    apiMock.getInvitations.mockImplementation(() =>
      Promise.resolve({ invitations } as any),
    );

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("@bob")).toBeDefined();
    });

    // No share or revoke button for used invitations
    expect(screen.queryByText("Revoke")).toBeNull();
  });

  it("auto-redeem from URL query parameter", async () => {
    apiMock.getInvitations.mockImplementation(() =>
      Promise.resolve({ invitations: [] } as any),
    );

    render(<InvitePage />, { wrapper: WrapperWithCode });

    await waitFor(() => {
      expect(apiMock.redeemInvitation).toHaveBeenCalledWith("TESTCODE");
    });

    await waitFor(() => {
      expect(
        screen.getByText(/You and @Alice are now following each other!/),
      ).toBeDefined();
    });
  });

  it("shows empty state when no invitations", async () => {
    apiMock.getInvitations.mockImplementation(() =>
      Promise.resolve({ invitations: [] } as any),
    );

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(
        screen.getByText(
          "No invitations yet. Create one to invite your friends!",
        ),
      ).toBeDefined();
    });
  });

  it("shows error when redeem fails", async () => {
    apiMock.redeemInvitation.mockImplementation(() =>
      Promise.reject(new Error("Invitation expired")),
    );

    render(<InvitePage />, { wrapper: WrapperWithCode });

    await waitFor(() => {
      expect(apiMock.redeemInvitation).toHaveBeenCalledWith("TESTCODE");
    });

    await waitFor(() => {
      expect(screen.getByText("Invitation expired")).toBeDefined();
    });
  });
});
