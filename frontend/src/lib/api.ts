const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TOKEN_KEY = "twayba.token";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode); the session just won't survive a reload.
  }
}

let onUnauthorized: (() => void) | null = null;

/** Called by AuthProvider so any 401 logs the user out. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection.");
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    const message = Array.isArray(data?.message)
      ? data.message.join(". ")
      : (data?.message ?? `Request failed (${res.status})`);
    throw new ApiError(res.status, message);
  }
  return data as T;
}
