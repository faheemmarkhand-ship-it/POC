// src/lib/api-client.ts
// Thin fetch wrapper for the FastAPI backend (port 8001 via the Caddy gateway).
// All requests use relative paths with ?XTransformPort=8001 so the gateway routes them.

const PORT = "8001";

function url(path: string, params?: Record<string, string | undefined>) {
  const u = new URL(path, window.location.origin);
  u.searchParams.set("XTransformPort", PORT);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
    }
  }
  return u.toString();
}

async function req<T>(path: string, options?: RequestInit, params?: Record<string, string | undefined>): Promise<T> {
  const res = await fetch(url(path, params), {
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || body.message || detail;
    } catch {}
    throw new Error(`API ${res.status}: ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, params?: Record<string, string | undefined>) => req<T>(path, { method: "GET" }, params),
  post: <T>(path: string, body?: unknown) => req<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => req<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => req<T>(path, { method: "DELETE" }),
};
