import type { Card, NewCard, CardColumn } from "../types";

const API_BASE = "/api";

function getAuthToken(): string {
  const token = localStorage.getItem("auth_token");
  if (!token) {
    throw new Error("No auth token found");
  }
  return token;
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem("auth_token");
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    throw new Error(`Request failed: ${response.statusText}`);
  }

  return response;
}

export async function getCardsByBoardId(boardId: string): Promise<Card[]> {
  const response = await fetchWithAuth(`${API_BASE}/boards/${boardId}/cards`);
  return response.json();
}

export async function getCard(id: string): Promise<Card> {
  const response = await fetchWithAuth(`${API_BASE}/cards/${id}`);
  return response.json();
}

export async function createCard(data: NewCard): Promise<Card> {
  const response = await fetchWithAuth(`${API_BASE}/cards`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function updateCard(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    column: CardColumn;
    position: number;
  }>
): Promise<Card> {
  const response = await fetchWithAuth(`${API_BASE}/cards/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function deleteCard(id: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/cards/${id}`, {
    method: "DELETE",
  });
}

export async function moveCardToColumn(
  cardId: string,
  targetColumn: CardColumn,
  targetPosition?: number
): Promise<Card> {
  const response = await fetchWithAuth(`${API_BASE}/cards/${cardId}`, {
    method: "PUT",
    body: JSON.stringify({ column: targetColumn, position: targetPosition }),
  });
  return response.json();
}

export async function batchUpdateCards(updates: Array<{
  id: string;
  changes: Partial<Card>;
}>): Promise<Card[]> {
  // This would be implemented on the server
  // For now, update cards sequentially
  const results: Card[] = [];
  for (const update of updates) {
    const card = await updateCard(update.id, update.changes);
    results.push(card);
  }
  return results;
}

export function sortCardsByPosition(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.position - b.position);
}

export function groupCardsByColumn(cards: Card[]): Record<CardColumn, Card[]> {
  return cards.reduce((acc, card) => {
    if (!acc[card.column]) {
      acc[card.column] = [];
    }
    acc[card.column].push(card);
    return acc;
  }, {} as Record<CardColumn, Card[]>);
}