import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { Bookmark } from "../types.ts";

type AppStatus = "idle" | "loading" | "saving";

interface ApiError {
  error: string;
}

function truncateTitle(title: string, max = 100): string {
  if (title.length <= max) return title;
  return title.slice(0, max) + "\u2026";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function apiGet(query?: string, tag?: string): Promise<Bookmark[]> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (tag) params.set("tag", tag);
  const qs = params.toString();
  const res = await fetch(`/api/bookmarks${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch bookmarks");
  return res.json() as Promise<Bookmark[]>;
}

async function apiCreate(
  url: string,
  tags: string
): Promise<Bookmark | ApiError> {
  const res = await fetch("/api/bookmarks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, tags: tags || undefined }),
  });
  const data: unknown = await res.json();
  if (!res.ok) return data as ApiError;
  return data as Bookmark;
}

async function apiDelete(id: string): Promise<boolean> {
  const res = await fetch(`/api/bookmarks/${id}`, { method: "DELETE" });
  return res.ok;
}

export function App(): ReactNode {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [status, setStatus] = useState<AppStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBookmarks = useCallback(
    async (query?: string, tag?: string): Promise<void> => {
      try {
        const data = await apiGet(query, tag);
        setBookmarks(data);
      } catch {
        setError("Failed to load bookmarks");
      } finally {
        setStatus("idle");
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setStatus("loading");
      fetchBookmarks(searchQuery || undefined, activeTag || undefined);
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, activeTag, fetchBookmarks]);

  const handleSave = async (): Promise<void> => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    setError(null);
    setStatus("saving");

    const result = await apiCreate(trimmed, tagsInput.trim());

    if ("error" in result) {
      setError(result.error);
      setStatus("idle");
      return;
    }

    setUrlInput("");
    setTagsInput("");
    setStatus("loading");
    await fetchBookmarks(searchQuery || undefined, activeTag || undefined);
  };

  const handleDelete = async (id: string): Promise<void> => {
    const ok = await apiDelete(id);
    if (!ok) {
      setError("Failed to delete bookmark");
      return;
    }
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const handleTagClick = (tag: string): void => {
    if (activeTag === tag) {
      setActiveTag(null);
    } else {
      setActiveTag(tag);
      setSearchQuery("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter") {
      handleSave();
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Bookmark Vault</h1>
        <p>Save and organize your links</p>
      </header>

      {/* Add bookmark form */}
      <div className="add-form">
        <div className="form-row">
          <div className="input-group">
            <input
              type="text"
              placeholder="Paste a URL..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <input
              type="text"
              placeholder="Tags (comma-separated)"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            className="btn-save"
            onClick={handleSave}
            disabled={status === "saving" || !urlInput.trim()}
          >
            {status === "saving" ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && <div className="message message-error">{error}</div>}

      {/* Search bar */}
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search bookmarks..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (activeTag) setActiveTag(null);
          }}
        />
      </div>

      {/* Active tag filter */}
      {activeTag && (
        <div className="active-filter">
          <span>Filtering by:</span>
          <span className="filter-tag">{activeTag}</span>
          <button
            className="btn-clear-filter"
            onClick={() => setActiveTag(null)}
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Loading state */}
      {status === "loading" && bookmarks.length === 0 && (
        <div className="spinner" />
      )}

      {/* Bookmark list */}
      {status !== "loading" || bookmarks.length > 0 ? (
        bookmarks.length > 0 ? (
          <>
            <div className="bookmark-count">
              {bookmarks.length} bookmark{bookmarks.length !== 1 ? "s" : ""}
            </div>
            <div className="bookmark-list">
              {bookmarks.map((bm) => (
                <div key={bm.id} className="bookmark-card">
                  <div className="bookmark-info">
                    <a
                      className="bookmark-title"
                      href={bm.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={bm.title}
                    >
                      {truncateTitle(bm.title)}
                    </a>
                    <div className="bookmark-url">{bm.url}</div>
                    <div className="bookmark-meta">
                      <span className="bookmark-date">
                        {formatDate(bm.created_at)}
                      </span>
                      {bm.tags.map((tag) => (
                        <button
                          key={tag}
                          className="tag-pill"
                          onClick={() => handleTagClick(tag)}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    className="btn-delete"
                    onClick={() => handleDelete(bm.id)}
                    title="Delete bookmark"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : status !== "loading" ? (
          <div className="empty-state">
            <div className="empty-icon">&#128278;</div>
            {searchQuery || activeTag ? (
              <>
                <h3>No bookmarks match</h3>
                <p>Try a different search or clear the filter</p>
              </>
            ) : (
              <>
                <h3>No bookmarks yet</h3>
                <p>Paste a URL above to save your first bookmark</p>
              </>
            )}
          </div>
        ) : null
      ) : null}
    </div>
  );
}
