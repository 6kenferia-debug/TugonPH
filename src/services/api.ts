const TOKEN_STORAGE_KEY = "tugonph.mongo.jwt";
const AUTH_EXPIRED_EVENT = "tugonph:auth-expired";

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Continue clearing in-memory auth state when storage is unavailable.
  }
}

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean;
};

async function request<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { auth = true, body, headers: suppliedHeaders, ...requestOptions } = options;
  const headers = new Headers(suppliedHeaders);
  const token = auth ? getAuthToken() : null;

  if (token) headers.set("Authorization", `Bearer ${token}`);

  let requestBody: BodyInit | undefined;
  if (body !== undefined) {
    if (body instanceof FormData || body instanceof Blob) {
      requestBody = body;
    } else {
      headers.set("Content-Type", "application/json");
      requestBody = JSON.stringify(body);
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/${endpoint.replace(/^\/+/, "")}`, {
      ...requestOptions,
      headers,
      body: requestBody,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown network error";
    throw new ApiError(
      `Unable to reach the TugonPH API. Start the backend with "npm run server" and confirm the API is listening on port 5000. (${detail})`,
      0,
      "NETWORK_ERROR",
    );
  }

  const payload = response.status === 204
    ? null
    : await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && auth && token) {
      clearAuthToken();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
    }

    throw new ApiError(
      payload?.error || `Request failed with status ${response.status}.`,
      response.status,
      payload?.code,
    );
  }

  return payload as T;
}

async function requestBlob(endpoint: string): Promise<Blob> {
  const token = getAuthToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/${endpoint.replace(/^\/+/, "")}`, {
      method: "GET",
      headers,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown network error";
    throw new ApiError(
      `Unable to reach the TugonPH API. Start the backend with "npm run server" and confirm the API is listening on port 5000. (${detail})`,
      0,
      "NETWORK_ERROR",
    );
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (response.status === 401 && token) {
      clearAuthToken();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
    }
    throw new ApiError(
      payload?.error || `Request failed with status ${response.status}.`,
      response.status,
      payload?.code,
    );
  }
  return response.blob();
}

export const api = {
  get: <T>(endpoint: string, options: Omit<ApiRequestOptions, "method" | "body"> = {}) =>
    request<T>(endpoint, { ...options, method: "GET" }),
  post: <T>(endpoint: string, body?: unknown, options: Omit<ApiRequestOptions, "method" | "body"> = {}) =>
    request<T>(endpoint, { ...options, method: "POST", body }),
  put: <T>(endpoint: string, body?: unknown, options: Omit<ApiRequestOptions, "method" | "body"> = {}) =>
    request<T>(endpoint, { ...options, method: "PUT", body }),
  delete: <T>(endpoint: string, options: Omit<ApiRequestOptions, "method" | "body"> = {}) =>
    request<T>(endpoint, { ...options, method: "DELETE" }),
  getBlob: requestBlob,
};

export const authExpiredEventName = AUTH_EXPIRED_EVENT;