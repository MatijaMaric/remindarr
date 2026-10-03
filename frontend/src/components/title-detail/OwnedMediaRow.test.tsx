import { describe, it, expect, afterEach, beforeEach, spyOn } from "bun:test";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import "../../i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../../api";
import * as sonner from "sonner";
import type { OwnedFormat } from "../../types";
import OwnedMediaRow from "./OwnedMediaRow";
import ProvidersSection from "./ProvidersSection";

let spies: ReturnType<typeof spyOn>[] = [];
let client: QueryClient;

function renderRow(formats: OwnedFormat[]) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(["title-detail", "movie-1"], {
    title: { id: "movie-1", owned_formats: formats },
  });
  return render(
    <QueryClientProvider client={client}>
      <OwnedMediaRow titleId="movie-1" formats={formats} />
    </QueryClientProvider>,
  );
}

function cachedFormats() {
  return client.getQueryData<{ title: { owned_formats: OwnedFormat[] } }>([
    "title-detail",
    "movie-1",
  ])?.title.owned_formats;
}

beforeEach(() => {
  spies = [
    spyOn(api, "setOwnedFormats").mockResolvedValue({ formats: [] }),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("OwnedMediaRow", () => {
  it("shows 'I own this' when nothing is owned", () => {
    renderRow([]);
    expect(screen.getByText("I own this")).toBeDefined();
    expect(screen.getByText("Owned")).toBeDefined();
  });

  it("shows a chip per owned format and 'Edit'", () => {
    renderRow(["bluray", "dvd"]);
    expect(screen.getByText("Edit")).toBeDefined();
    // chip + checkbox label
    expect(screen.getAllByText("Blu-ray")).toHaveLength(2);
    expect(screen.getAllByText("DVD")).toHaveLength(2);
  });

  it("adds a format in canonical order and updates the cache", async () => {
    renderRow(["bluray"]);
    fireEvent.click(screen.getByLabelText("DVD"));
    await waitFor(() =>
      expect(api.setOwnedFormats).toHaveBeenCalledWith("movie-1", [
        "dvd",
        "bluray",
      ]),
    );
    expect(cachedFormats()).toEqual(["dvd", "bluray"]);
  });

  it("removes a format when its checkbox is unchecked", async () => {
    renderRow(["bluray", "vhs"]);
    fireEvent.click(screen.getByLabelText("VHS"));
    await waitFor(() =>
      expect(api.setOwnedFormats).toHaveBeenCalledWith("movie-1", ["bluray"]),
    );
  });

  it("rolls back the cache and toasts on failure", async () => {
    (api.setOwnedFormats as any).mockRejectedValueOnce(new Error("boom"));
    renderRow(["bluray"]);
    fireEvent.click(screen.getByLabelText("DVD"));
    await waitFor(() => expect(sonner.toast.error).toHaveBeenCalled());
    expect(cachedFormats()).toEqual(["bluray"]);
  });
});

describe("ProvidersSection with owned", () => {
  it("renders only the Owned row when there is no streaming availability", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProvidersSection
          offers={[]}
          watchProviders={undefined}
          watchLink={undefined}
          owned={{ titleId: "movie-1", formats: [] }}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Owned")).toBeDefined();
    expect(screen.queryByText("Stream")).toBeNull();
  });
});
