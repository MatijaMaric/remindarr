import { describe, it, expect, afterEach, beforeEach, spyOn } from "bun:test";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import type { ReactNode } from "react";
import "../i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import * as sonner from "sonner";
import TagList from "./TagList";

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      {children}
    </QueryClientProvider>
  );
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "updateTrackedTags").mockResolvedValue(undefined as any),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("TagList", () => {
  it("renders existing tags", () => {
    render(
      <TagList
        titleId="t-1"
        tags={["action", "scifi"]}
        onTagsChange={() => {}}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("action")).toBeTruthy();
    expect(screen.getByText("scifi")).toBeTruthy();
  });

  it("renders an input for adding new tags", () => {
    render(<TagList titleId="t-1" tags={[]} onTagsChange={() => {}} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("calls api.updateTrackedTags when adding a tag via Enter", async () => {
    render(
      <TagList titleId="t-1" tags={["action"]} onTagsChange={() => {}} />,
      { wrapper: Wrapper },
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "drama" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(api.updateTrackedTags).toHaveBeenCalledWith("t-1", [
        "action",
        "drama",
      ]);
    });
  });

  it("calls onTagsChange callback after saving", async () => {
    let called: string[] | undefined;
    render(
      <TagList
        titleId="t-1"
        tags={[]}
        onTagsChange={(tags) => {
          called = tags;
        }}
      />,
      { wrapper: Wrapper },
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "comedy" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(called).toEqual(["comedy"]);
    });
  });

  it("removes a tag when the remove button is clicked", async () => {
    render(
      <TagList
        titleId="t-1"
        tags={["action", "drama"]}
        onTagsChange={() => {}}
      />,
      { wrapper: Wrapper },
    );

    const removeBtn = screen.getByLabelText("Remove tag action");
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(api.updateTrackedTags).toHaveBeenCalledWith("t-1", ["drama"]);
    });
  });

  it("shows error toast when API call fails", async () => {
    (api.updateTrackedTags as any).mockRejectedValueOnce(new Error("fail"));

    render(<TagList titleId="t-1" tags={[]} onTagsChange={() => {}} />, {
      wrapper: Wrapper,
    });

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "fail-tag" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(sonner.toast.error).toHaveBeenCalledWith("Failed to save tags");
    });
  });

  it("does not add duplicate tags", async () => {
    render(
      <TagList titleId="t-1" tags={["action"]} onTagsChange={() => {}} />,
      { wrapper: Wrapper },
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "action" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await new Promise((r) => setTimeout(r, 20));
    expect(api.updateTrackedTags).not.toHaveBeenCalled();
  });
});
