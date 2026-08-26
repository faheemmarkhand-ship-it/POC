// src/lib/api-client.ts
// Fetch wrapper for the Next.js API routes (under /api/* on the same domain).
// On Vercel (and in production), all API calls go to /api/* on the same origin.
// No XTransformPort needed — Next.js API routes are served by the same app.

function url(path: string, params?: Record<string, string | undefined>) {
  const u = new URL(path, window.location.origin);
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
      detail = body.detail || body.message || body.error || detail;
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
