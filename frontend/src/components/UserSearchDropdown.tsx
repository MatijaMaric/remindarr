import { useState, useEffect, useRef } from "react";
import { useClickOutside } from "../hooks/useClickOutside";
import { X, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import * as api from "../api";

export interface SelectedUser {
  id: string;
  username: string;
  displayName: string | null;
  image: string | null;
}

interface Props {
  onSelect: (user: SelectedUser) => void;
  selected?: SelectedUser | null;
  onClear?: () => void;
}

export default function UserSearchDropdown({
  onSelect,
  selected,
  onClear,
}: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["user-search", debouncedQuery],
    enabled: debouncedQuery.length >= 1,
    queryFn: ({ signal }) =>
      api.searchUsers(debouncedQuery, signal).then((d) =>
        d.users.map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.display_name ?? null,
          image: u.image,
        })),
      ),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const results = data ?? [];
  const open =
    query.length >= 1 && debouncedQuery.length >= 1 && results.length > 0;
  const loading = isFetching;

  useClickOutside(containerRef, open, () => setQuery(""));

  if (selected) {
    return (
      <div className="flex items-center gap-3 bg-muted rounded-sm px-3 py-2">
        {selected.image ? (
          <img
            src={selected.image}
            alt={selected.username}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-muted-hover flex items-center justify-center text-muted-foreground text-sm font-medium">
            {selected.username[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">
            {selected.displayName || selected.username}
          </div>
          {selected.displayName && (
            <div className="text-xs text-muted-foreground truncate">
              @{selected.username}
            </div>
          )}
        </div>
        <button
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 cursor-pointer"
          aria-label="Clear selection"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users..."
          className="w-full bg-muted text-foreground rounded-sm pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary border border-border"
          data-testid="user-search-input"
        />
      </div>

      {open && (
        <div
          className="absolute z-10 mt-1 w-full bg-muted border border-border rounded-sm shadow-lg max-h-48 overflow-y-auto"
          data-testid="user-search-results"
        >
          {results.map((user) => (
            <button
              key={user.id}
              onClick={() => {
                onSelect(user);
                setQuery("");
              }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted-hover transition-colors cursor-pointer text-left"
              data-testid="user-search-result"
            >
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.username}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-muted-hover flex items-center justify-center text-muted-foreground text-sm font-medium">
                  {user.username[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {user.displayName || user.username}
                </div>
                {user.displayName && (
                  <div className="text-xs text-muted-foreground truncate">
                    @{user.username}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {loading && query.length > 0 && !open && (
        <div className="absolute z-10 mt-1 w-full bg-muted border border-border rounded-sm shadow-lg px-3 py-2">
          <span className="text-sm text-muted-foreground">Searching...</span>
        </div>
      )}
    </div>
  );
}
