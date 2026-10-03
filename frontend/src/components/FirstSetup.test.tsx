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

it("does not flash or show onboarding for an existing library", async () => {
  let resolveLibrary!: (data: { titles: { id: number }[] }) => void;
  apiMock.getTrackedTitles.mockImplementation(
    () => new Promise((resolve) => (resolveLibrary = resolve)),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { container } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FirstSetup />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(container.innerHTML).toBe("");
  resolveLibrary({ titles: [{ id: 1 }] });
  await waitFor(() =>
    expect(client.getQueryState(["tracked"])?.status).toBe("success"),
  );
  expect(container.innerHTML).toBe("");
  expect(apiMock.getProviders).not.toHaveBeenCalled();
  expect(apiMock.getNotifiers).not.toHaveBeenCalled();
});
it("dismisses completely across remounts, reports configuration without claiming verified delivery", async () => {
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
  expect(first.container.innerHTML).toBe("");
  expect(localStorage.getItem("setup-dismissed:setup-user")).toBe("1");
  first.unmount();
  const second = render(tree());
  expect(
    screen.queryByRole("region", { name: "First reminder setup" }),
  ).toBeNull();
  expect(second.container.innerHTML).toBe("");
});
