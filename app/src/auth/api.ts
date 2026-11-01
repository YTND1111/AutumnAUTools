import { apiRequest } from "../services/api";
import type { AuthSessionResponse, AuthUser, BackendMeta } from "./types";

/** 认证 / 账号相关接口（与 backend/src/routes/auth.ts、account.ts 一一对应） */

export function registerRequest(
  username: string,
  password: string,
  email?: string,
): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>("/api/auth/register", {
    method: "POST",
    auth: false,
    body: { username, password, ...(email ? { email } : {}) },
  });
}

export function loginRequest(username: string, password: string): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>("/api/auth/login", {
    method: "POST",
    auth: false,
    body: { username, password },
  });
}

export function logoutRequest(): Promise<void> {
  return apiRequest<void>("/api/auth/logout", { method: "POST" });
}

export function meRequest(): Promise<{ user: AuthUser; session: { expiresAt: number } }> {
  return apiRequest<{ user: AuthUser; session: { expiresAt: number } }>("/api/auth/me");
}

export function metaRequest(): Promise<BackendMeta> {
  return apiRequest<BackendMeta>("/api/meta", { auth: false });
}

export function exportAccountRequest(): Promise<unknown> {
  return apiRequest<unknown>("/api/account/export");
}

export function deleteAccountRequest(password: string): Promise<void> {
  return apiRequest<void>("/api/account", { method: "DELETE", body: { password } });
}
