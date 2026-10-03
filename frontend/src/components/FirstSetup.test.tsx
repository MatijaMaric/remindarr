import { afterEach, beforeEach, expect, it, spyOn } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import * as auth from "../context/AuthContext";
import "../i18n";

const { default: FirstSetup } = await import("./FirstSetup");
let authSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  authSpy = spyOn(auth, "useAuth").mockReturnValue({
    user: { id: "setup-user" },
    subscriptions: { providerIds: [8] },
  } as ReturnType<typeof auth.useAuth>);
});
afterEach(() => {
  cleanup();
  authSpy.mockRestore();
  resetApiMock();
  localStorage.clear();
});

it("can skip and resume, reports configuration without claiming verified delivery", async () => {
  apiMock.getProviders.mockResolvedValue({ providers: [], country: "HR" });
  apiMock.getTrackedTitles.mockResolvedValue({ titles: [] });
  apiMock.getNotifiers.mockResolvedValue({ notifiers: [{ enabled: true }] });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FirstSetup />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const first = render(tree());
  await waitFor(() =>
    expect(
      screen.getByText(/destination configured; delivery still needs checking/),
    ).toBeDefined(),
  );
  expect(
    screen
      .getByRole("link", { name: "Configure a destination and send a test" })
      .getAttribute("href"),
  ).toBe("/settings?tab=notifications");
  expect(apiMock.testNotifier).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  first.unmount();
  render(tree());
  expect(
    screen.queryByRole("region", { name: "First reminder setup" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Resume setup guide" }));
  expect(
    screen.getByRole("region", { name: "First reminder setup" }),
  ).toBeDefined();
});
