import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import ExternalLinks from "./ExternalLinks";

afterEach(cleanup);

describe("ExternalLinks", () => {
  it("always renders TMDB link", () => {
    render(<ExternalLinks tmdbId={123} type="movie" />);
    const link = screen.getByTestId("external-link-tmdb");
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://www.themoviedb.org/movie/123");
  });

  it("renders all links when all IDs are present", () => {
    const externalIds = {
      imdb_id: "tt1234567",
      facebook_id: "TestMovie",
      instagram_id: "testmovie",
      twitter_id: "testmovie",
    };
    render(<ExternalLinks externalIds={externalIds} tmdbId={456} type="movie" />);

    expect(screen.getByTestId("external-link-tmdb").getAttribute("href")).toBe(
      "https://www.themoviedb.org/movie/456",
    );
    expect(screen.getByTestId("external-link-imdb").getAttribute("href")).toBe(
      "https://www.imdb.com/title/tt1234567",
    );
    expect(screen.getByTestId("external-link-instagram").getAttribute("href")).toBe(
      "https://www.instagram.com/testmovie",
    );
    expect(screen.getByTestId("external-link-x").getAttribute("href")).toBe(
      "https://x.com/testmovie",
    );
    expect(screen.getByTestId("external-link-facebook").getAttribute("href")).toBe(
      "https://www.facebook.com/TestMovie",
    );
  });

  it("hides links with null IDs", () => {
    const externalIds = {
      imdb_id: null,
      facebook_id: null,
      instagram_id: null,
      twitter_id: null,
    };
    render(<ExternalLinks externalIds={externalIds} tmdbId={789} type="tv" />);

    expect(screen.getByTestId("external-link-tmdb")).toBeTruthy();
    expect(screen.queryByTestId("external-link-imdb")).toBeNull();
    expect(screen.queryByTestId("external-link-instagram")).toBeNull();
    expect(screen.queryByTestId("external-link-x")).toBeNull();
    expect(screen.queryByTestId("external-link-facebook")).toBeNull();
  });

  it("uses /name/ path for person IMDB links", () => {
    const externalIds = { imdb_id: "nm1234567" };
    render(<ExternalLinks externalIds={externalIds} tmdbId={42} type="person" />);

    expect(screen.getByTestId("external-link-imdb").getAttribute("href")).toBe(
      "https://www.imdb.com/name/nm1234567",
    );
    expect(screen.getByTestId("external-link-tmdb").getAttribute("href")).toBe(
      "https://www.themoviedb.org/person/42",
    );
  });

  it("uses /title/ path for movie IMDB links", () => {
    const externalIds = { imdb_id: "tt9999999" };
    render(<ExternalLinks externalIds={externalIds} tmdbId={100} type="movie" />);

    expect(screen.getByTestId("external-link-imdb").getAttribute("href")).toBe(
      "https://www.imdb.com/title/tt9999999",
    );
  });

  it("uses /tv/ path for TV show TMDB links", () => {
    render(<ExternalLinks tmdbId={200} type="tv" />);

    expect(screen.getByTestId("external-link-tmdb").getAttribute("href")).toBe(
      "https://www.themoviedb.org/tv/200",
    );
  });

  it("opens links in new tab", () => {
    const externalIds = { imdb_id: "tt0000001" };
    render(<ExternalLinks externalIds={externalIds} tmdbId={1} type="movie" />);

    const links = screen.getAllByRole("link");
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("renders with no externalIds prop", () => {
    render(<ExternalLinks tmdbId={999} type="movie" />);
    // Should only show TMDB link
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("https://www.themoviedb.org/movie/999");
  });
});
