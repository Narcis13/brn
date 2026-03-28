export interface Label {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
}

export interface Activity {
  id: string;
  card_id: string;
  board_id: string;
  action: string;
  detail: string | null;
  timestamp: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  user_ids: string[];
}

export interface TimelineComment {
  type: "comment";
  id: string;
  content: string;
  user_id: string;
  username: string;
  created_at: string;
  updated_at: string;
  reactions: ReactionGroup[];
}

export interface TimelineActivity {
  type: "activity";
  id: string;
  action: string;
  detail: string | null;
  user_id: string | null;
  username: string | null;
  timestamp: string;
  reactions: ReactionGroup[];
}

export type TimelineItem = TimelineComment | TimelineActivity;

export interface BoardMember {
  id: string;
  username: string;
  role: "owner" | "member";
  invited_at: string;
}

export interface BoardActivityItem {
  type: "comment" | "activity";
  id: string;
  card_id?: string;
  card_title?: string;
  content?: string;
  action?: string;
  detail?: string | null;
  user_id: string | null;
  username: string | null;
  timestamp: string;
  reactions: ReactionGroup[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface CardRecord {
  id: string;
  title: string;
  description: string;
  position: number;
  column_id: string;
  created_at: string;
  due_date: string | null;
  start_date: string | null;
  checklist: string;
  updated_at: string;
}

export interface BoardCard extends CardRecord {
  labels: Label[];
  checklist_total: number;
  checklist_done: number;
}

export interface Artifact {
  id: string;
  board_id: string;
  card_id: string | null;
  filename: string;
  filetype: "md" | "html" | "js" | "ts" | "sh";
  position: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  // content is omitted in list responses, included in individual GET
  content?: string;
}

export interface CardDetail extends BoardCard {
  activity: Activity[];
  timeline: TimelineItem[];
  is_watching: boolean;
  watcher_count: number;
  board_members: { id: string; username: string }[];
  artifacts: Artifact[]; // without content
}

export interface SearchCard extends BoardCard {
  column_title: string;
}

export interface Column {
  id: string;
  title: string;
  position: number;
  cards: BoardCard[];
}

export interface User {
  id: string;
  username: string;
}

export interface Board {
  id: string;
  title: string;
  createdAt: string;
}

// --- Token management ---

const TOKEN_KEY = "brn_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// --- 401 handler ---

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(cb: () => void): void {
  onUnauthorized = cb;
}

// --- HTTP helper ---

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// --- Auth ---

export function register(
  username: string,
  password: string
): Promise<{ token: string; user: User }> {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(
  username: string,
  password: string
): Promise<{ token: string; user: User }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function getMe(): Promise<User> {
  return request("/auth/me");
}

// --- Boards ---

export function fetchBoards(): Promise<{ boards: Board[] }> {
  return request("/boards");
}

export function createBoard(title: string): Promise<Board> {
  return request("/boards", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function deleteBoard(id: string): Promise<{ ok: boolean }> {
  return request(`/boards/${id}`, { method: "DELETE" });
}

// --- Columns (board-scoped) ---

export function fetchColumns(boardId: string): Promise<{ columns: Column[] }> {
  return request(`/boards/${boardId}/columns`);
}

export function createColumn(boardId: string, title: string): Promise<Column> {
  return request(`/boards/${boardId}/columns`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function updateColumn(
  boardId: string,
  id: string,
  title: string
): Promise<Column> {
  return request(`/boards/${boardId}/columns/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function deleteColumn(
  boardId: string,
  id: string
): Promise<{ ok: boolean }> {
  return request(`/boards/${boardId}/columns/${id}`, { method: "DELETE" });
}

export function reorderColumns(
  boardId: string,
  columnIds: string[]
): Promise<{ ok: boolean }> {
  return request(`/boards/${boardId}/columns/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ column_ids: columnIds }),
  });
}

// --- Cards (board-scoped) ---

export function createCard(
  boardId: string,
  title: string,
  columnId: string,
  description: string = "",
  due_date?: string | null
): Promise<CardRecord> {
  return request(`/boards/${boardId}/cards`, {
    method: "POST",
    body: JSON.stringify({ title, columnId, description, due_date }),
  });
}

export function updateCard(
  boardId: string,
  id: string,
  updates: {
    title?: string;
    description?: string;
    columnId?: string;
    position?: number;
    due_date?: string | null;
    start_date?: string | null;
    checklist?: string;
  }
): Promise<CardRecord> {
  return request(`/boards/${boardId}/cards/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function deleteCard(
  boardId: string,
  id: string
): Promise<{ ok: boolean }> {
  return request(`/boards/${boardId}/cards/${id}`, { method: "DELETE" });
}

export function fetchCardDetail(
  boardId: string,
  id: string
): Promise<CardDetail> {
  return request(`/boards/${boardId}/cards/${id}`);
}

export function fetchBoardLabels(
  boardId: string
): Promise<{ labels: Label[] }> {
  return request(`/boards/${boardId}/labels`);
}

export function searchBoard(
  boardId: string,
  filters: { q?: string; labelId?: string },
  signal?: AbortSignal
): Promise<{ cards: SearchCard[] }> {
  const params = new URLSearchParams();

  if (filters.q && filters.q.trim() !== "") {
    params.set("q", filters.q.trim());
  }

  if (filters.labelId) {
    params.set("label", filters.labelId);
  }

  const query = params.toString();
  return request(`/boards/${boardId}/search${query ? `?${query}` : ""}`, {
    signal,
  });
}

export function fetchCalendarCards(
  boardId: string,
  start: string,
  end: string
): Promise<{ cards: BoardCard[] }> {
  const params = new URLSearchParams({ start, end });
  return request(`/boards/${boardId}/calendar?${params.toString()}`);
}

export function createLabel(
  boardId: string,
  name: string,
  color: string
): Promise<Label> {
  return request(`/boards/${boardId}/labels`, {
    method: "POST",
    body: JSON.stringify({ name, color }),
  });
}

export function assignCardLabel(
  boardId: string,
  cardId: string,
  labelId: string
): Promise<{ ok: boolean }> {
  return request(`/boards/${boardId}/cards/${cardId}/labels`, {
    method: "POST",
    body: JSON.stringify({ labelId }),
  });
}

export function removeCardLabel(
  boardId: string,
  cardId: string,
  labelId: string
): Promise<{ ok: boolean }> {
  return request(`/boards/${boardId}/cards/${cardId}/labels/${labelId}`, {
    method: "DELETE",
  });
}

// --- Board Members ---

export function fetchBoardMembers(
  boardId: string
): Promise<{ members: BoardMember[] }> {
  return request(`/boards/${boardId}/members`);
}

export function inviteMember(
  boardId: string,
  username: string
): Promise<BoardMember> {
  return request(`/boards/${boardId}/members`, {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function removeMember(
  boardId: string,
  userId: string
): Promise<{ ok: boolean }> {
  return request(`/boards/${boardId}/members/${userId}`, {
    method: "DELETE",
  });
}

// --- Comments ---

export function createComment(
  boardId: string,
  cardId: string,
  content: string
): Promise<TimelineComment> {
  return request(`/boards/${boardId}/cards/${cardId}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function updateComment(
  boardId: string,
  cardId: string,
  commentId: string,
  content: string
): Promise<TimelineComment> {
  return request(`/boards/${boardId}/cards/${cardId}/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

export function deleteComment(
  boardId: string,
  cardId: string,
  commentId: string
): Promise<{ ok: boolean }> {
  return request(`/boards/${boardId}/cards/${cardId}/comments/${commentId}`, {
    method: "DELETE",
  });
}

// --- Reactions ---

export function toggleReaction(
  boardId: string,
  targetType: "comment" | "activity",
  targetId: string,
  emoji: string
): Promise<{ action: "added" | "removed"; reaction: { id: string; emoji: string; user_id: string } }> {
  return request(`/boards/${boardId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ target_type: targetType, target_id: targetId, emoji }),
  });
}

// --- Watchers ---

export function toggleWatch(
  boardId: string,
  cardId: string
): Promise<{ watching: boolean }> {
  return request(`/boards/${boardId}/cards/${cardId}/watch`, {
    method: "POST",
  });
}

// --- Board Activity Feed ---

export function fetchBoardActivity(
  boardId: string,
  options?: { limit?: number; before?: string }
): Promise<{ items: BoardActivityItem[]; has_more: boolean }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.before) params.set("before", options.before);
  const query = params.toString();
  return request(`/boards/${boardId}/activity${query ? `?${query}` : ""}`);
}

// --- Artifacts ---

export function fetchCardArtifacts(
  boardId: string,
  cardId: string
): Promise<{ artifacts: Artifact[] }> {
  return request(`/boards/${boardId}/cards/${cardId}/artifacts`);
}

export function fetchBoardArtifacts(
  boardId: string
): Promise<{ artifacts: Artifact[] }> {
  return request(`/boards/${boardId}/artifacts?scope=board`);
}

export function fetchArtifact(
  boardId: string,
  artifactId: string
): Promise<Artifact> {
  return request(`/boards/${boardId}/artifacts/${artifactId}`);
}

export function createCardArtifact(
  boardId: string,
  cardId: string,
  filename: string,
  filetype: Artifact["filetype"],
  content: string
): Promise<Artifact> {
  return request(`/boards/${boardId}/cards/${cardId}/artifacts`, {
    method: "POST",
    body: JSON.stringify({ filename, filetype, content }),
  });
}

export function createBoardArtifact(
  boardId: string,
  filename: string,
  filetype: Artifact["filetype"],
  content: string
): Promise<Artifact> {
  return request(`/boards/${boardId}/artifacts`, {
    method: "POST",
    body: JSON.stringify({ filename, filetype, content }),
  });
}

export function updateArtifact(
  boardId: string,
  artifactId: string,
  updates: { content?: string; filename?: string }
): Promise<Artifact> {
  return request(`/boards/${boardId}/artifacts/${artifactId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function deleteArtifact(
  boardId: string,
  artifactId: string
): Promise<{ ok: boolean }> {
  return request(`/boards/${boardId}/artifacts/${artifactId}`, {
    method: "DELETE",
  });
}
