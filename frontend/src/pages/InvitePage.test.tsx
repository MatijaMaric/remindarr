import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

// Initialize i18n before anything else
import "../i18n";

// Mock auth context
mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", username: "testuser", display_name: "Test User", auth_provider: "local", is_admin: false },
    providers: { local: true, oidc: null },
    loading: false,
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  }),
  AuthContext: {
    Provider: ({ children }: { children: ReactNode }) => children,
  },
}));

const mockGetInvitations = mock(() =>
  Promise.resolve({ invitations: [] })
);
const mockCreateInvitation = mock(() =>
  Promise.resolve({ id: "inv-new", code: "NEWCODE", expires_at: new Date(Date.now() + 7 * 86400000).toISOString() })
);
const mockRevokeInvitation = mock(() => Promise.resolve());
const mockRedeemInvitation = mock(() =>
  Promise.resolve({ success: true, inviter: { id: "u2", username: "alice", display_name: "Alice", image: null } })
);

mock.module("../api", () => ({
  getInvitations: mockGetInvitations,
  createInvitation: mockCreateInvitation,
  revokeInvitation: mockRevokeInvitation,
  redeemInvitation: mockRedeemInvitation,
}));

const { default: InvitePage } = await import("./InvitePage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function WrapperWithCode({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/invite?code=TESTCODE"]}>{children}</MemoryRouter>;
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
  mockGetInvitations.mockImplementation(() =>
    Promise.resolve({ invitations: [] })
  );
  mockCreateInvitation.mockImplementation(() =>
    Promise.resolve({ id: "inv-new", code: "NEWCODE", expires_at: new Date(Date.now() + 7 * 86400000).toISOString() })
  );
  mockRevokeInvitation.mockImplementation(() => Promise.resolve());
  mockRedeemInvitation.mockImplementation(() =>
    Promise.resolve({ success: true, inviter: { id: "u2", username: "alice", display_name: "Alice", image: null } })
  );
});

afterEach(() => {
  cleanup();
  mockGetInvitations.mockReset();
  mockCreateInvitation.mockReset();
  mockRevokeInvitation.mockReset();
  mockRedeemInvitation.mockReset();
});

describe("InvitePage", () => {
  it("renders invitation list", async () => {
    const invitations = [
      makeInvitation({ id: "inv-1", code: "CODE1" }),
      makeInvitation({ id: "inv-2", code: "CODE2" }),
    ];
    mockGetInvitations.mockImplementation(() =>
      Promise.resolve({ invitations })
    );

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("CODE1")).toBeDefined();
      expect(screen.getByText("CODE2")).toBeDefined();
    });
  });

  it("generate button creates new invitation", async () => {
    mockGetInvitations.mockImplementation(() =>
      Promise.resolve({ invitations: [] })
    );
    // After creation, refresh will return the new invitation
    let callCount = 0;
    mockGetInvitations.mockImplementation(() => {
      callCount++;
      if (callCount > 1) {
        return Promise.resolve({
          invitations: [makeInvitation({ id: "inv-new", code: "NEWCODE" })],
        });
      }
      return Promise.resolve({ invitations: [] });
    });

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Create Invite Link")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Create Invite Link"));

    await waitFor(() => {
      expect(mockCreateInvitation).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("NEWCODE")).toBeDefined();
    });
  });

  it("share button present for pending invitations", async () => {
    const invitations = [makeInvitation()];
    mockGetInvitations.mockImplementation(() =>
      Promise.resolve({ invitations })
    );

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Share")).toBeDefined();
    });
  });

  it("revoke button works", async () => {
    const invitations = [makeInvitation({ id: "inv-1", code: "REVOKEME" })];
    mockGetInvitations.mockImplementation(() =>
      Promise.resolve({ invitations })
    );

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Revoke")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Revoke"));

    await waitFor(() => {
      expect(mockRevokeInvitation).toHaveBeenCalledWith("inv-1");
    });

    // Card should be removed after revoke
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
    mockGetInvitations.mockImplementation(() =>
      Promise.resolve({ invitations })
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
        used_by: { id: "u3", username: "bob", display_name: "Bob", image: null },
      }),
    ];
    mockGetInvitations.mockImplementation(() =>
      Promise.resolve({ invitations })
    );

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("@bob")).toBeDefined();
    });

    // No share or revoke button for used invitations
    expect(screen.queryByText("Revoke")).toBeNull();
  });

  it("auto-redeem from URL query parameter", async () => {
    mockGetInvitations.mockImplementation(() =>
      Promise.resolve({ invitations: [] })
    );

    render(<InvitePage />, { wrapper: WrapperWithCode });

    await waitFor(() => {
      expect(mockRedeemInvitation).toHaveBeenCalledWith("TESTCODE");
    });

    await waitFor(() => {
      expect(screen.getByText(/You and @Alice are now following each other!/)).toBeDefined();
    });
  });

  it("shows empty state when no invitations", async () => {
    mockGetInvitations.mockImplementation(() =>
      Promise.resolve({ invitations: [] })
    );

    render(<InvitePage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("No invitations yet. Create one to invite your friends!")).toBeDefined();
    });
  });

  it("shows error when redeem fails", async () => {
    mockRedeemInvitation.mockImplementation(() =>
      Promise.reject(new Error("Invitation expired"))
    );

    render(<InvitePage />, { wrapper: WrapperWithCode });

    await waitFor(() => {
      expect(mockRedeemInvitation).toHaveBeenCalledWith("TESTCODE");
    });

    await waitFor(() => {
      expect(screen.getByText("Invitation expired")).toBeDefined();
    });
  });
});
