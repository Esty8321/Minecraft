// src/utils/api.ts
import {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  RegisterResponse,
  User,
} from "../types/auth";

// כתובת הבסיס מה-ENV (Edge). אם אין, נופל ל-localhost:8080
const API_BASE_URL = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.detail || j?.error || JSON.stringify(j);
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg);
  }

  return res.json() as Promise<T>;
}

// ---------- Auth ----------
export const authApi = {
  register(data: RegisterRequest): Promise<RegisterResponse> {
    return apiRequest<RegisterResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  login(data: LoginRequest): Promise<AuthResponse> {
    return apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  health(): Promise<{ ok: boolean; service: string }> {
    return apiRequest<{ ok: boolean; service: string }>("/health");
  },
};

// ---------- Helpers ----------
export const authHeader = (token?: string | null): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {};

// ---------- Game (דרך ה-Edge, מוגן ב-JWT) ----------
export const gameApi = {
  // דוגמה שמחזירה את הכותרת שהגיעה לשרת (לראות שהטוקן עובר)
  me(token: string) {
    return apiRequest<{ ok: boolean; auth?: string }>("/game/me", {
      headers: { ...authHeader(token) },
    });
  },

  health(token: string) {
    return apiRequest<{ ok: boolean; service: string }>("/game/health", {
      headers: { ...authHeader(token) },
    });
  },

 
};

export type { User };
export default { authApi, gameApi, apiRequest, authHeader };
