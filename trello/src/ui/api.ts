export interface Card {
  id: string;
  title: string;
  description: string;
  position: number;
  column_id: string;
  created_at: string;
}

export interface Column {
  id: string;
  title: string;
  position: number;
  cards: Card[];
}

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchColumns(): Promise<{ columns: Column[] }> {
  return request("/columns");
}

export function createColumn(title: string): Promise<Column> {
  return request("/columns", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function updateColumn(id: string, title: string): Promise<Column> {
  return request(`/columns/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function deleteColumn(id: string): Promise<{ ok: boolean }> {
  return request(`/columns/${id}`, { method: "DELETE" });
}

export function createCard(
  title: string,
  columnId: string,
  description: string = ""
): Promise<Card> {
  return request("/cards", {
    method: "POST",
    body: JSON.stringify({ title, columnId, description }),
  });
}

export function updateCard(
  id: string,
  updates: { title?: string; description?: string; columnId?: string; position?: number }
): Promise<Card> {
  return request(`/cards/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function deleteCard(id: string): Promise<{ ok: boolean }> {
  return request(`/cards/${id}`, { method: "DELETE" });
}
