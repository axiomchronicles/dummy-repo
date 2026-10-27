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

export async function apiRequest<T = any>(
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
  let json: any = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text };
    }
  }

  if (!res.ok) {
    const errObj = json?.error || json || {};
    throw new ApiError(
      res.status,
      errObj.code || `HTTP_${res.status}`,
      errObj.message || res.statusText || 'Request failed',
    );
  }

  return json as T;
}
