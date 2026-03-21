/**
 * Centralized API client with error handling and automatic logout on token expiration.
 * All API calls should go through this client.
 */

import { getToken, clearToken } from "./auth";

/**
 * Custom error class for API errors with HTTP status codes.
 */
export class ApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Internal request handler that adds auth headers, handles errors,
 * and triggers logout on 401 responses.
 */
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new ApiError("Not authenticated", 401);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError("Network error: please check your connection", 0);
  }

  if (response.status === 401) {
    clearToken();
    throw new ApiError("Session expired: please log in again", 401);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Could not parse error body — use generic message
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/**
 * Retries a function once on failure. Does not retry 401 auth errors.
 */
async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw error;
    }
    return fn();
  }
}

/**
 * Centralized API client. All authenticated API calls should use this client.
 *
 * Features:
 * - Automatic token inclusion in all requests
 * - Automatic logout (token clear) on 401 responses
 * - User-friendly error messages for network failures
 * - Simple retry support for transient failures
 */
export const apiClient = {
  /**
   * Send a GET request.
   */
  get<T>(url: string): Promise<T> {
    return request<T>(url, { method: "GET" });
  },

  /**
   * Send a POST request with an optional JSON body.
   */
  post<T>(url: string, data?: unknown): Promise<T> {
    return request<T>(url, {
      method: "POST",
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  },

  /**
   * Send a PUT request with an optional JSON body.
   */
  put<T>(url: string, data?: unknown): Promise<T> {
    return request<T>(url, {
      method: "PUT",
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  },

  /**
   * Send a DELETE request.
   */
  del(url: string): Promise<void> {
    return request<void>(url, { method: "DELETE" });
  },

  /**
   * Retry a function once on failure. Does not retry 401 auth errors.
   */
  retry<T>(fn: () => Promise<T>): Promise<T> {
    return retryOnce(fn);
  },
};
