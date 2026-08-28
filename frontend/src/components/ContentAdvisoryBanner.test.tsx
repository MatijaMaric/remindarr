import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import "../i18n";
import { AuthContext } from "../context/AuthContext";
import { apiMock } from "../test-utils/apiMock";
import ContentAdvisoryBanner from "./ContentAdvisoryBanner";

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

const mockAuthValue = {
  user: { id: "1", username: "test", display_name: null, is_admin: false },
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

function renderBanner(client: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthContext value={mockAuthValue as any}>{children}</AuthContext>
      </QueryClientProvider>
    );
  }
  return render(<ContentAdvisoryBanner titleId="movie-1" certification="R" />, {
    wrapper: Wrapper,
  });
}

beforeEach(() => {
  apiMock.getAdvisorySettings.mockResolvedValue({
    level: "moderate",
    allowlist: [],
  });
  apiMock.updateAdvisoryAllowlist.mockResolvedValue({
    level: "moderate",
    allowlist: ["movie-1"],
  });
});

afterEach(() => {
  cleanup();
});

describe("ContentAdvisoryBanner", () => {
  it("does not render when the filter is off", async () => {
    apiMock.getAdvisorySettings.mockResolvedValue({
      level: "none",
      allowlist: [],
    });
    const client = newTestClient();
    client.setQueryData(["advisory-settings"], {
      level: "none",
      allowlist: [],
    });
    renderBanner(client);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("warns on a hidden title and allowlists it without turning the filter off", async () => {
    const client = newTestClient();
    client.setQueryData(["advisory-settings"], {
      level: "moderate",
      allowlist: [],
    });
    renderBanner(client);
    expect(screen.getByRole("status")).toBeDefined();
    expect(
      screen.getByText(/This title is rated R — above your content advisory/i),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /always show this title/i }),
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: /always show this title/i }),
    );
    expect(apiMock.updateAdvisoryAllowlist).toHaveBeenCalledWith(
      "movie-1",
      true,
    );
  });
});
