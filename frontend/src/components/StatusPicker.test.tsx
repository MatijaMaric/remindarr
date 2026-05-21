import { describe, it, expect, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import "../i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import * as sonner from "sonner";
import StatusPicker from "./StatusPicker";

function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={newTestClient()}>{children}</QueryClientProvider>;
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "updateTrackedStatus").mockResolvedValue(undefined as any),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("StatusPicker", () => {
  it("renders the current status", () => {
    render(
      <StatusPicker titleId="t-1" objectType="SHOW" currentStatus="watching" onStatusChange={() => {}} />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText(/watching/i)).toBeTruthy();
  });

  it("renders 'Auto' when status is null", () => {
    render(
      <StatusPicker titleId="t-1" objectType="SHOW" currentStatus={null} onStatusChange={() => {}} />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText(/auto/i)).toBeTruthy();
  });

  it("opens dropdown on click", () => {
    render(
      <StatusPicker titleId="t-1" objectType="SHOW" currentStatus={null} onStatusChange={() => {}} />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("calls api.updateTrackedStatus when an option is clicked", async () => {
    const onStatusChange = spyOn({ fn: (_: string | null) => {} }, "fn");
    render(
      <StatusPicker
        titleId="t-1"
        objectType="SHOW"
        currentStatus={null}
        onStatusChange={onStatusChange}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const watchingOption = screen.getByRole("option", { name: /watching/i });
    fireEvent.click(watchingOption);

    await waitFor(() => {
      expect(api.updateTrackedStatus).toHaveBeenCalledWith("t-1", "watching");
    });
  });

  it("calls onStatusChange callback on success", async () => {
    let called: string | null | undefined = undefined;
    render(
      <StatusPicker
        titleId="t-1"
        objectType="SHOW"
        currentStatus={null}
        onStatusChange={(s) => { called = s; }}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("option", { name: /watching/i }));

    await waitFor(() => {
      expect(called).toBe("watching");
    });
  });

  it("shows error toast when API call fails", async () => {
    (api.updateTrackedStatus as any).mockRejectedValueOnce(new Error("fail"));

    render(
      <StatusPicker titleId="t-1" objectType="SHOW" currentStatus={null} onStatusChange={() => {}} />,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("option", { name: /watching/i }));

    await waitFor(() => {
      expect(sonner.toast.error).toHaveBeenCalledWith("Failed to update status");
    });
  });

  it("renders movie options for MOVIE objectType", () => {
    render(
      <StatusPicker titleId="t-1" objectType="MOVIE" currentStatus={null} onStatusChange={() => {}} />,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const listbox = screen.getByRole("listbox");
    expect(listbox.textContent).toContain("Plan to Watch");
    expect(listbox.textContent).not.toContain("Watching");
  });
});
