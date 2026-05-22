import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../i18n";
import EditWatchedAtDialog from "./EditWatchedAtDialog";
import * as api from "../api";

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "patchWatchHistoryEntry").mockResolvedValue({
      id: "hist-1",
      watchedAt: "2024-06-01 00:00:00",
    }),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

function renderDialog(
  overrides: Partial<Parameters<typeof EditWatchedAtDialog>[0]> = {},
) {
  const defaults = {
    open: true,
    onClose: mock(() => {}),
    entryId: "hist-1",
    currentWatchedAt: "2024-05-01 10:00:00",
    anchorDate: null as string | null,
    onUpdated: mock((_: string) => {}),
  };
  const props = { ...defaults, ...overrides };
  const qc = newTestClient();
  return {
    result: render(
      <QueryClientProvider client={qc}>
        <EditWatchedAtDialog {...props} />
      </QueryClientProvider>,
    ),
    props,
    qc,
  };
}

describe("EditWatchedAtDialog", () => {
  it("renders the dialog title", () => {
    renderDialog();
    expect(screen.getByText("Edit watched date")).toBeDefined();
  });

  it("renders Today, Yesterday, and Last week chips", () => {
    renderDialog();
    expect(screen.getByText("Today")).toBeDefined();
    expect(screen.getByText("Yesterday")).toBeDefined();
    expect(screen.getByText("Last week")).toBeDefined();
  });

  it("does not render On release chip when anchorDate is null", () => {
    renderDialog({ anchorDate: null });
    expect(screen.queryByText("On release")).toBeNull();
  });

  it("renders On release chip when anchorDate is provided", () => {
    renderDialog({ anchorDate: "2024-01-15" });
    expect(screen.getByText("On release")).toBeDefined();
  });

  it("clicking Cancel does not call patchWatchHistoryEntry", () => {
    renderDialog();
    fireEvent.click(screen.getByText("Cancel"));
    expect(api.patchWatchHistoryEntry).not.toHaveBeenCalled();
  });

  it("clicking Save calls patchWatchHistoryEntry with the entry id", async () => {
    renderDialog({ entryId: "hist-42" });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(api.patchWatchHistoryEntry).toHaveBeenCalled();
      const [id] = (api.patchWatchHistoryEntry as ReturnType<typeof spyOn>).mock
        .calls[0] as [string, string];
      expect(id).toBe("hist-42");
    });
  });

  it("invalidates query caches on successful save", async () => {
    const { qc } = renderDialog();
    const invalidateSpy = spyOn(qc, "invalidateQueries");

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(api.patchWatchHistoryEntry).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalled();
    });

    const keys = invalidateSpy.mock.calls.map(
      (call: any[]) => (call[0] as any)?.queryKey,
    );
    expect(keys).toContainEqual(["stats"]);
    expect(keys).toContainEqual(["activity"]);

    invalidateSpy.mockRestore();
  });
});
