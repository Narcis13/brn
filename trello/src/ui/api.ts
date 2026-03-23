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

export interface CardDetail extends BoardCard {
  activity: Activity[];
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

// --- Cards (board-scoped) ---

export function createCard(
  boardId: string,
  title: string,
  columnId: string,
  description: string = ""
): Promise<CardRecord> {
  return request(`/boards/${boardId}/cards`, {
    method: "POST",
    body: JSON.stringify({ title, columnId, description }),
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
