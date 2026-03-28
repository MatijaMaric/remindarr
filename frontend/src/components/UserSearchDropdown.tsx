import { useState, useEffect, useRef } from "react";
import { X, Search } from "lucide-react";
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

export default function UserSearchDropdown({ onSelect, selected, onClear }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SelectedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.searchUsers(query);
        const mapped = data.users.map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.display_name ?? u.name ?? null,
          image: u.image,
        }));
        setResults(mapped);
        setOpen(mapped.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-3 bg-zinc-800 rounded-md px-3 py-2">
        {selected.image ? (
          <img
            src={selected.image}
            alt={selected.username}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-400 text-sm font-medium">
            {selected.username[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{selected.displayName || selected.username}</div>
          {selected.displayName && (
            <div className="text-xs text-zinc-400 truncate">@{selected.username}</div>
          )}
        </div>
        <button
          onClick={onClear}
          className="text-zinc-400 hover:text-white transition-colors p-1 cursor-pointer"
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users..."
          className="w-full bg-zinc-800 text-white rounded-md pl-9 pr-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500 border border-zinc-700"
          data-testid="user-search-input"
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-48 overflow-y-auto" data-testid="user-search-results">
          {results.map((user) => (
            <button
              key={user.id}
              onClick={() => {
                onSelect(user);
                setQuery("");
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-700 transition-colors cursor-pointer text-left"
              data-testid="user-search-result"
            >
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.username}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-400 text-sm font-medium">
                  {user.username[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{user.displayName || user.username}</div>
                {user.displayName && (
                  <div className="text-xs text-zinc-400 truncate">@{user.username}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {loading && query.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md shadow-lg px-3 py-2">
          <span className="text-sm text-zinc-400">Searching...</span>
        </div>
      )}
    </div>
  );
}
