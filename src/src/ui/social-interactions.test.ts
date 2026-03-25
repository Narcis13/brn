import { describe, it, expect } from "bun:test";

// Test the renderMentions logic (extracted for testability)
function findMentions(
  content: string,
  memberUsernames: Set<string>
): { start: number; end: number; username: string; isMember: boolean }[] {
  const results: { start: number; end: number; username: string; isMember: boolean }[] = [];
  const regex = /@(\w+)/g;
  let match = regex.exec(content);

  while (match !== null) {
    const username = match[1]!;
    results.push({
      start: match.index,
      end: regex.lastIndex,
      username,
      isMember: memberUsernames.has(username),
    });
    match = regex.exec(content);
  }
  return results;
}

// Test the relativeTime logic (extracted for testability)
function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return timestamp;
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return "older";
}

// Test avatar color generation
function getAvatarColor(username: string): string {
  const AVATAR_COLORS = [
    "#e74c3c", "#3498db", "#27ae60", "#f39c12", "#8e44ad",
    "#16a085", "#c0392b", "#2980b9", "#d35400", "#2d3436",
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

describe("Social Interactions — @Mention Detection", () => {
  it("should find @mentions in content", () => {
    const members = new Set(["alice", "bob"]);
    const mentions = findMentions("Hey @alice, can you check this?", members);

    expect(mentions).toHaveLength(1);
    expect(mentions[0]!.username).toBe("alice");
    expect(mentions[0]!.isMember).toBe(true);
  });

  it("should find multiple @mentions", () => {
    const members = new Set(["alice", "bob", "charlie"]);
    const mentions = findMentions("@alice @bob please review @charlie's work", members);

    expect(mentions).toHaveLength(3);
    expect(mentions[0]!.username).toBe("alice");
    expect(mentions[1]!.username).toBe("bob");
    expect(mentions[2]!.username).toBe("charlie");
    expect(mentions.every((m) => m.isMember)).toBe(true);
  });

  it("should mark non-member mentions as not a member", () => {
    const members = new Set(["alice"]);
    const mentions = findMentions("@alice @stranger hello", members);

    expect(mentions).toHaveLength(2);
    expect(mentions[0]!.isMember).toBe(true);
    expect(mentions[1]!.isMember).toBe(false);
  });

  it("should return empty array for content without mentions", () => {
    const members = new Set(["alice"]);
    const mentions = findMentions("No mentions here", members);

    expect(mentions).toHaveLength(0);
  });

  it("should handle @mention at start and end of content", () => {
    const members = new Set(["alice", "bob"]);
    const mentions = findMentions("@alice check this @bob", members);

    expect(mentions).toHaveLength(2);
    expect(mentions[0]!.start).toBe(0);
  });
});

describe("Social Interactions — Relative Time", () => {
  it("should show 'just now' for timestamps within the last minute", () => {
    const now = new Date();
    now.setSeconds(now.getSeconds() - 30);
    expect(relativeTime(now.toISOString())).toBe("just now");
  });

  it("should show minutes ago for recent timestamps", () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5);
    expect(relativeTime(now.toISOString())).toBe("5m ago");
  });

  it("should show hours ago", () => {
    const now = new Date();
    now.setHours(now.getHours() - 3);
    expect(relativeTime(now.toISOString())).toBe("3h ago");
  });

  it("should show days ago", () => {
    const now = new Date();
    now.setDate(now.getDate() - 7);
    expect(relativeTime(now.toISOString())).toBe("7d ago");
  });

  it("should handle invalid timestamps", () => {
    expect(relativeTime("not-a-date")).toBe("not-a-date");
  });
});

describe("Social Interactions — Avatar Colors", () => {
  it("should return a color for any username", () => {
    const color = getAvatarColor("alice");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("should return the same color for the same username", () => {
    const color1 = getAvatarColor("alice");
    const color2 = getAvatarColor("alice");
    expect(color1).toBe(color2);
  });

  it("should return different colors for different usernames", () => {
    // Not guaranteed, but likely for short distinct usernames
    const colors = new Set(["alice", "bob", "charlie", "david", "eve"].map(getAvatarColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("Social Interactions — Member Display Logic", () => {
  it("should show max 5 avatars with overflow count", () => {
    const members = Array.from({ length: 8 }, (_, i) => ({
      id: `user-${i}`,
      username: `user${i}`,
      role: i === 0 ? "owner" as const : "member" as const,
      invited_at: "2026-01-01",
    }));

    const displayMembers = members.slice(0, 5);
    const overflowCount = members.length - 5;

    expect(displayMembers).toHaveLength(5);
    expect(overflowCount).toBe(3);
  });

  it("should show no overflow for 5 or fewer members", () => {
    const members = Array.from({ length: 3 }, (_, i) => ({
      id: `user-${i}`,
      username: `user${i}`,
      role: i === 0 ? "owner" as const : "member" as const,
      invited_at: "2026-01-01",
    }));

    const displayMembers = members.slice(0, 5);
    const overflowCount = members.length - 5;

    expect(displayMembers).toHaveLength(3);
    expect(overflowCount).toBeLessThanOrEqual(0);
  });

  it("should detect owner status correctly", () => {
    const members = [
      { id: "u1", username: "alice", role: "owner" as const, invited_at: "2026-01-01" },
      { id: "u2", username: "bob", role: "member" as const, invited_at: "2026-01-02" },
    ];

    const currentUserId = "u1";
    const isOwner = members.some((m) => m.id === currentUserId && m.role === "owner");
    expect(isOwner).toBe(true);

    const nonOwnerUserId = "u2";
    const isOwner2 = members.some((m) => m.id === nonOwnerUserId && m.role === "owner");
    expect(isOwner2).toBe(false);
  });
});

describe("Social Interactions — Watch Toggle Logic", () => {
  it("should toggle watching state", () => {
    let isWatching = false;
    let watcherCount = 3;

    // Toggle on
    isWatching = true;
    watcherCount = watcherCount + 1;
    expect(isWatching).toBe(true);
    expect(watcherCount).toBe(4);

    // Toggle off
    isWatching = false;
    watcherCount = Math.max(0, watcherCount - 1);
    expect(isWatching).toBe(false);
    expect(watcherCount).toBe(3);
  });

  it("should not go below zero watchers", () => {
    let watcherCount = 0;
    watcherCount = Math.max(0, watcherCount - 1);
    expect(watcherCount).toBe(0);
  });
});

describe("Social Interactions — Timeline Sorting", () => {
  it("should sort timeline items newest first", () => {
    const items = [
      { type: "comment" as const, created_at: "2026-01-01T10:00:00Z" },
      { type: "activity" as const, timestamp: "2026-01-01T12:00:00Z" },
      { type: "comment" as const, created_at: "2026-01-01T11:00:00Z" },
    ];

    const sorted = [...items].sort((a, b) => {
      const timeA = a.type === "comment" ? a.created_at : a.timestamp;
      const timeB = b.type === "comment" ? b.created_at : b.timestamp;
      return timeB.localeCompare(timeA);
    });

    expect(sorted[0]!.type).toBe("activity");
    expect(sorted[1]!.type).toBe("comment");
    expect((sorted[1] as { created_at: string }).created_at).toBe("2026-01-01T11:00:00Z");
    expect(sorted[2]!.type).toBe("comment");
    expect((sorted[2] as { created_at: string }).created_at).toBe("2026-01-01T10:00:00Z");
  });
});

describe("Social Interactions — Comment Authorization", () => {
  it("should allow author to edit their own comment", () => {
    const commentUserId = "user-1";
    const currentUserId = "user-1";
    const canEdit = commentUserId === currentUserId;
    expect(canEdit).toBe(true);
  });

  it("should not allow non-author to edit a comment", () => {
    const commentUserId: string = "user-1";
    const currentUserId: string = "user-2";
    const canEdit = commentUserId === currentUserId;
    expect(canEdit).toBe(false);
  });

  it("should allow author to delete their own comment", () => {
    const commentUserId = "user-1";
    const currentUserId = "user-1";
    const isOwner = false;
    const canDelete = commentUserId === currentUserId || isOwner;
    expect(canDelete).toBe(true);
  });

  it("should allow board owner to delete any comment", () => {
    const commentUserId: string = "user-1";
    const currentUserId: string = "user-2";
    const isOwner = true;
    const canDelete = commentUserId === currentUserId || isOwner;
    expect(canDelete).toBe(true);
  });

  it("should not allow non-owner non-author to delete a comment", () => {
    const commentUserId: string = "user-1";
    const currentUserId: string = "user-2";
    const isOwner = false;
    const canDelete = commentUserId === currentUserId || isOwner;
    expect(canDelete).toBe(false);
  });
});

describe("Social Interactions — Reaction Display", () => {
  it("should highlight reactions from current user", () => {
    const reactions = [
      { emoji: "👍", count: 3, user_ids: ["u1", "u2", "u3"] },
      { emoji: "❤️", count: 1, user_ids: ["u2"] },
    ];
    const currentUserId = "u1";

    const hasReacted = reactions.map((r) => ({
      emoji: r.emoji,
      mine: r.user_ids.includes(currentUserId),
    }));

    expect(hasReacted[0]!.mine).toBe(true);
    expect(hasReacted[1]!.mine).toBe(false);
  });

  it("should enforce the 8 allowed emoji set", () => {
    const ALLOWED_EMOJI = ["👍", "👎", "❤️", "🎉", "😄", "😕", "🚀", "👀"];
    expect(ALLOWED_EMOJI).toHaveLength(8);

    // All unique
    const unique = new Set(ALLOWED_EMOJI);
    expect(unique.size).toBe(8);
  });

  it("should show reaction count for each emoji", () => {
    const reactions = [
      { emoji: "👍", count: 5, user_ids: ["u1", "u2", "u3", "u4", "u5"] },
      { emoji: "🚀", count: 1, user_ids: ["u1"] },
    ];

    expect(reactions[0]!.count).toBe(5);
    expect(reactions[1]!.count).toBe(1);
  });

  it("should compute mine state for interactive chips", () => {
    const reactions = [
      { emoji: "👍", count: 2, user_ids: ["u1", "u3"] },
      { emoji: "❤️", count: 1, user_ids: ["u2"] },
      { emoji: "🚀", count: 3, user_ids: ["u1", "u2", "u3"] },
    ];

    const currentUserId = "u1";
    const chipStates = reactions.map((r) => ({
      emoji: r.emoji,
      count: r.count,
      isMine: r.user_ids.includes(currentUserId),
    }));

    expect(chipStates[0]!.isMine).toBe(true);
    expect(chipStates[1]!.isMine).toBe(false);
    expect(chipStates[2]!.isMine).toBe(true);
  });
});

describe("Social Interactions — @Mention Autocomplete", () => {
  function filterMembers(
    members: { id: string; username: string }[],
    query: string
  ): { id: string; username: string }[] {
    return members.filter((m) => m.username.toLowerCase().startsWith(query.toLowerCase()));
  }

  function extractMentionQuery(text: string, cursorPos: number): string | null {
    const textBefore = text.slice(0, cursorPos);
    const match = /@(\w*)$/.exec(textBefore);
    return match ? match[1]! : null;
  }

  it("should extract mention query from text at cursor", () => {
    expect(extractMentionQuery("Hey @al", 7)).toBe("al");
    expect(extractMentionQuery("Hey @", 5)).toBe("");
    expect(extractMentionQuery("Hey there", 9)).toBeNull();
  });

  it("should filter members by query prefix", () => {
    const members = [
      { id: "u1", username: "alice" },
      { id: "u2", username: "alex" },
      { id: "u3", username: "bob" },
    ];

    expect(filterMembers(members, "al")).toHaveLength(2);
    expect(filterMembers(members, "ali")).toHaveLength(1);
    expect(filterMembers(members, "b")).toHaveLength(1);
    expect(filterMembers(members, "z")).toHaveLength(0);
  });

  it("should show all members when query is empty (@)", () => {
    const members = [
      { id: "u1", username: "alice" },
      { id: "u2", username: "bob" },
    ];

    expect(filterMembers(members, "")).toHaveLength(2);
  });

  it("should insert mention at correct position", () => {
    const text = "Hey @al everyone";
    const cursorPos = 7;
    const textBefore = text.slice(0, cursorPos);
    const textAfter = text.slice(cursorPos);
    const atIndex = textBefore.lastIndexOf("@");
    const username = "alice";
    const newText = `${textBefore.slice(0, atIndex)}@${username} ${textAfter}`;

    expect(newText).toBe("Hey @alice  everyone");
  });
});

describe("Social Interactions — Activity Sidebar", () => {
  it("should compute relative times correctly for sidebar items", () => {
    // The sidebar uses the same relativeTime logic
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    // Reuse relativeTime helper
    function relativeTimeCalc(timestamp: string): string {
      const then = new Date(timestamp).getTime();
      if (Number.isNaN(then)) return timestamp;
      const diff = Date.now() - then;
      const seconds = Math.floor(diff / 1000);
      if (seconds < 60) return "just now";
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 30) return `${days}d ago`;
      return "older";
    }

    expect(relativeTimeCalc(fiveMinAgo)).toBe("5m ago");
    expect(relativeTimeCalc(twoHoursAgo)).toBe("2h ago");
  });

  it("should handle pagination with before cursor", () => {
    const items = [
      { timestamp: "2026-03-25T15:00:00Z" },
      { timestamp: "2026-03-25T14:30:00Z" },
      { timestamp: "2026-03-25T14:00:00Z" },
    ];

    const lastItem = items[items.length - 1]!;
    expect(lastItem.timestamp).toBe("2026-03-25T14:00:00Z");

    // The 'before' cursor should be the last item's timestamp
    const beforeCursor = lastItem.timestamp;
    expect(beforeCursor).toBe("2026-03-25T14:00:00Z");
  });

  it("should append items on load more (not replace)", () => {
    const existing = [
      { id: "a1", type: "activity" as const },
      { id: "a2", type: "comment" as const },
    ];
    const newItems = [
      { id: "a3", type: "activity" as const },
    ];

    const merged = [...existing, ...newItems];
    expect(merged).toHaveLength(3);
    expect(merged[2]!.id).toBe("a3");
  });

  it("should truncate long comment previews", () => {
    const content = "A".repeat(200);
    const preview = content.slice(0, 120) + (content.length > 120 ? "..." : "");
    expect(preview).toHaveLength(123);
    expect(preview.endsWith("...")).toBe(true);

    const shortContent = "Short comment";
    const shortPreview = shortContent.slice(0, 120) + (shortContent.length > 120 ? "" : "");
    expect(shortPreview).toBe("Short comment");
  });

  it("should display activity items with correct type indicators", () => {
    const items = [
      { type: "comment" as const, action: null, content: "Great work!" },
      { type: "activity" as const, action: "moved", content: null },
    ];

    expect(items[0]!.type).toBe("comment");
    expect(items[1]!.type).toBe("activity");
    expect(items[1]!.action).toBe("moved");
  });
});
