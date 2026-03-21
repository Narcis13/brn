import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { apiClient, ApiError } from "./client";

const originalFetch = globalThis.fetch;

describe("apiClient", () => {
  let fetchMock: ReturnType<typeof mock>;

  beforeEach(() => {
    localStorage.setItem("auth_token", "test-token-123");
    fetchMock = mock(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    );
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  describe("authenticated requests", () => {
    test("includes Authorization header with token", async () => {
      await apiClient.get("/api/test");
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-token-123");
    });

    test("includes Content-Type header", async () => {
      await apiClient.get("/api/test");
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
    });

    test("throws ApiError when no token available", async () => {
      localStorage.clear();
      try {
        await apiClient.get("/api/test");
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(401);
        expect((error as ApiError).message).toContain("Not authenticated");
      }
    });
  });

  describe("401 response handling", () => {
    test("clears token on 401 response", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
        )
      );

      try {
        await apiClient.get("/api/test");
      } catch {
        // expected
      }

      expect(localStorage.getItem("auth_token")).toBeNull();
    });

    test("throws ApiError with session expired message on 401", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
        )
      );

      try {
        await apiClient.get("/api/test");
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toContain("Session expired");
        expect((error as ApiError).status).toBe(401);
      }
    });
  });

  describe("error handling", () => {
    test("throws user-friendly message for network errors", async () => {
      fetchMock.mockImplementation(() =>
        Promise.reject(new TypeError("Failed to fetch"))
      );

      try {
        await apiClient.get("/api/test");
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toContain("Network error");
      }
    });

    test("includes server error message when available", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Board not found" }), { status: 404 })
        )
      );

      try {
        await apiClient.get("/api/test");
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe("Board not found");
        expect((error as ApiError).status).toBe(404);
      }
    });

    test("throws generic message for non-JSON error responses", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response("Internal Server Error", { status: 500 }))
      );

      try {
        await apiClient.get("/api/test");
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(500);
        expect((error as ApiError).message).toContain("500");
      }
    });
  });

  describe("HTTP methods", () => {
    test("get sends GET request", async () => {
      await apiClient.get("/api/boards");
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/boards");
      expect(init.method).toBe("GET");
    });

    test("post sends POST request with body", async () => {
      const body = { name: "New Board" };
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ id: "1" }), { status: 201 }))
      );

      await apiClient.post("/api/boards", body);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/boards");
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify(body));
    });

    test("put sends PUT request with body", async () => {
      const body = { name: "Updated" };
      await apiClient.put("/api/boards/1", body);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/boards/1");
      expect(init.method).toBe("PUT");
      expect(init.body).toBe(JSON.stringify(body));
    });

    test("del sends DELETE request", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(null, { status: 204 }))
      );

      await apiClient.del("/api/boards/1");
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/boards/1");
      expect(init.method).toBe("DELETE");
    });
  });

  describe("retry", () => {
    test("retries a failed request once", async () => {
      let callCount = 0;
      const fn = mock(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Temporary failure");
        }
        return { data: "success" };
      });

      const result = await apiClient.retry(fn);
      expect(result).toEqual({ data: "success" });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test("throws after retry also fails", async () => {
      const fn = mock(async (): Promise<unknown> => {
        throw new Error("Persistent failure");
      });

      await expect(apiClient.retry(fn)).rejects.toThrow("Persistent failure");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test("returns immediately on first success", async () => {
      const fn = mock(async () => ({ data: "ok" }));

      const result = await apiClient.retry(fn);
      expect(result).toEqual({ data: "ok" });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("does not retry 401 errors", async () => {
      const fn = mock(async (): Promise<unknown> => {
        throw new ApiError("Session expired", 401);
      });

      await expect(apiClient.retry(fn)).rejects.toThrow("Session expired");
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("response parsing", () => {
    test("parses JSON response body", async () => {
      const data = { id: "1", name: "Test Board" };
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))
      );

      const result = await apiClient.get<{ id: string; name: string }>("/api/boards/1");
      expect(result).toEqual(data);
    });

    test("handles empty response for DELETE", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(null, { status: 204 }))
      );

      const result = await apiClient.del("/api/boards/1");
      expect(result).toBeUndefined();
    });
  });
});
