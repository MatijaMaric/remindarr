import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SearchBar from "./SearchBar";

afterEach(() => {
  cleanup();
});

describe("SearchBar", () => {
  it("renders input and search button", () => {
    const onSearch = mock(() => {});
    const onImdb = mock(() => {});
    render(<SearchBar onSearch={onSearch} onImdb={onImdb} />);

    expect(screen.getByPlaceholderText("Search titles or paste IMDB link...")).toBeDefined();
    expect(screen.getByRole("button", { name: "Search" })).toBeDefined();
  });

  it("disables button when input is empty", () => {
    const onSearch = mock(() => {});
    const onImdb = mock(() => {});
    render(<SearchBar onSearch={onSearch} onImdb={onImdb} />);

    const button = screen.getByRole("button", { name: "Search" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("enables button when input has text", () => {
    const onSearch = mock(() => {});
    const onImdb = mock(() => {});
    render(<SearchBar onSearch={onSearch} onImdb={onImdb} />);

    const input = screen.getByPlaceholderText("Search titles or paste IMDB link...");
    fireEvent.change(input, { target: { value: "Breaking Bad" } });

    const button = screen.getByRole("button", { name: "Search" });
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("calls onSearch for regular text queries", () => {
    const onSearch = mock(() => {});
    const onImdb = mock(() => {});
    render(<SearchBar onSearch={onSearch} onImdb={onImdb} />);

    const input = screen.getByPlaceholderText("Search titles or paste IMDB link...");
    fireEvent.change(input, { target: { value: "Breaking Bad" } });
    fireEvent.submit(input.closest("form")!);

    expect(onSearch).toHaveBeenCalledWith("Breaking Bad");
    expect(onImdb).not.toHaveBeenCalled();
  });

  it("calls onImdb for IMDB URLs", () => {
    const onSearch = mock(() => {});
    const onImdb = mock(() => {});
    render(<SearchBar onSearch={onSearch} onImdb={onImdb} />);

    const input = screen.getByPlaceholderText("Search titles or paste IMDB link...");
    fireEvent.change(input, {
      target: { value: "https://www.imdb.com/title/tt0903747/" },
    });
    fireEvent.submit(input.closest("form")!);

    expect(onImdb).toHaveBeenCalledWith("https://www.imdb.com/title/tt0903747/");
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("calls onImdb for bare IMDB IDs like tt0903747", () => {
    const onSearch = mock(() => {});
    const onImdb = mock(() => {});
    render(<SearchBar onSearch={onSearch} onImdb={onImdb} />);

    const input = screen.getByPlaceholderText("Search titles or paste IMDB link...");
    fireEvent.change(input, { target: { value: "tt0903747" } });
    fireEvent.submit(input.closest("form")!);

    expect(onImdb).toHaveBeenCalledWith("tt0903747");
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("does not submit when input is whitespace only", () => {
    const onSearch = mock(() => {});
    const onImdb = mock(() => {});
    render(<SearchBar onSearch={onSearch} onImdb={onImdb} />);

    const input = screen.getByPlaceholderText("Search titles or paste IMDB link...");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);

    expect(onSearch).not.toHaveBeenCalled();
    expect(onImdb).not.toHaveBeenCalled();
  });

  it("shows loading state when loading prop is true", () => {
    const onSearch = mock(() => {});
    const onImdb = mock(() => {});
    render(<SearchBar onSearch={onSearch} onImdb={onImdb} loading={true} />);

    expect(screen.getByRole("button", { name: "..." })).toBeDefined();
    expect(screen.getByRole("button", { name: "..." }).hasAttribute("disabled")).toBe(true);
  });
});
