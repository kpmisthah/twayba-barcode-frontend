/** Same-origin by default ("/api" is proxied to the backend in next.config.ts). */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const TOKEN_KEY = "twayba.token";

/** API_URL as an absolute URL (it may be relative to the page). */
function apiBase(): string {
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return new URL(API_URL, origin).toString();
}

/** Full URL for a file the API serves, e.g. "/uploads/products/x.jpg". */
export function assetUrl(path: string): string {
  return new URL(path, apiBase()).toString();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Machine-readable reason some endpoints add, e.g. "WRONG_LOCATION". */
    public code?: string,
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

interface RequestOptions {
  method?: string;
  /** JSON body, or FormData for file uploads. */
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const url = new URL(apiBase().replace(/\/$/, "") + path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = options.body instanceof FormData;
  if (options.body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: isForm ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection.");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401 && token) onUnauthorized?.();
    const message = Array.isArray(data?.message)
      ? data.message.join(". ")
      : (data?.message ?? `Request failed (${res.status})`);
    throw new ApiError(res.status, message, typeof data?.code === "string" ? data.code : undefined);
  }
  return res;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await send(path, options);
  if (res.status === 204) return undefined as T;
  return (await res.json().catch(() => null)) as T;
}

/** For endpoints that return a file (e.g. label PDFs). */
export async function apiBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  return (await send(path, options)).blob();
}
