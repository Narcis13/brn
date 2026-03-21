import type { Board, NewBoard } from "../types";

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

export async function getBoards(): Promise<Board[]> {
  const response = await fetchWithAuth(`${API_BASE}/boards`);
  return response.json();
}

export async function getBoard(id: string): Promise<Board> {
  const response = await fetchWithAuth(`${API_BASE}/boards/${id}`);
  return response.json();
}

export async function createBoard(data: NewBoard): Promise<Board> {
  const response = await fetchWithAuth(`${API_BASE}/boards`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function updateBoard(id: string, data: Partial<NewBoard>): Promise<Board> {
  const response = await fetchWithAuth(`${API_BASE}/boards/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function deleteBoard(id: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/boards/${id}`, {
    method: "DELETE",
  });
}