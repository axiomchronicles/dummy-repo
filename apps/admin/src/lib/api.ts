export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem('admin_access_token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('admin_access_token', token);
}

export function clearAuthToken() {
  localStorage.removeItem('admin_access_token');
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  mfaEnabled?: boolean;
}

export interface AdminOverview {
  killSwitch?: { active?: boolean; reason?: string };
  userCount?: number;
  campaignCount?: number;
  attemptCount?: number;
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/mfa/verify')) {
    clearAuthToken();
    window.location.reload();
  }

  const text = await res.text();
  let json: { error?: ApiErrorBody; code?: string; message?: string } | null = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text };
    }
  }

  if (!res.ok) {
    const errObj: ApiErrorBody = json?.error || json || {};
    throw new ApiError(
      res.status,
      errObj.code || `HTTP_${res.status}`,
      errObj.message || res.statusText || 'Request failed',
    );
  }

  return json as T;
}
