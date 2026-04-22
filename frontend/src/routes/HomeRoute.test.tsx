import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";

import "../i18n";

let mockIsMobile = false;
mock.module("../hooks/useIsMobile", () => ({
  useIsMobile: () => mockIsMobile,
}));

const { default: HomeRoute } = await import("./HomeRoute");
const { AuthContext } = await import("../context/AuthContext");

const authedUser = { id: "1", username: "test", display_name: null, auth_provider: "local", is_admin: false };

function makeAuth(overrides: Partial<{ user: unknown; loading: boolean }> = {}) {
  return {
    user: overrides.user ?? null,
    providers: null,
    loading: overrides.loading ?? false,
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  };
}

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="pathname">{loc.pathname}</span>;
}

function Harness({ authValue }: { authValue: ReturnType<typeof makeAuth> }) {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <AuthContext value={authValue as any}>
        <LocationProbe />
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/reels" element={<div data-testid="reels-page">Reels</div>} />
        </Routes>
      </AuthContext>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  mockIsMobile = false;
});

describe("HomeRoute", () => {
  it("redirects authenticated mobile users to /reels", async () => {
    mockIsMobile = true;
    const { getByTestId } = render(<Harness authValue={makeAuth({ user: authedUser })} />);

    await waitFor(() => {
      expect(getByTestId("pathname").textContent).toBe("/reels");
    });
  });

  it("stays on / for authenticated desktop users", async () => {
    mockIsMobile = false;
    const { getByTestId } = render(<Harness authValue={makeAuth({ user: authedUser })} />);

    // Give React a tick to process any pending effects; pathname should remain "/".
    await new Promise((r) => setTimeout(r, 10));
    expect(getByTestId("pathname").textContent).toBe("/");
  });

  it("stays on / for unauthenticated mobile users", async () => {
    mockIsMobile = true;
    const { getByTestId } = render(<Harness authValue={makeAuth({ user: null })} />);

    await new Promise((r) => setTimeout(r, 10));
    expect(getByTestId("pathname").textContent).toBe("/");
  });

  it("does not redirect while auth is loading, even on mobile", async () => {
    mockIsMobile = true;
    const { getByTestId } = render(
      <Harness authValue={makeAuth({ user: authedUser, loading: true })} />,
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(getByTestId("pathname").textContent).toBe("/");
  });
});
