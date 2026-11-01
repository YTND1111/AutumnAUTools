/** 后端返回的用户信息（与 backend/src/types.ts 的 PublicUser 对应） */
export interface AuthUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  createdAt: number;
  lastLoginAt: number | null;
}

/** 注册 / 登录成功后的响应 */
export interface AuthSessionResponse {
  user: AuthUser;
  token: string;
  expiresAt: number;
}

/** GET /api/meta 的公开配置 */
export interface BackendMeta {
  service: string;
  version: string;
  appName: string;
  registrationOpen: boolean;
  sessionTtlDays: number;
  limits: {
    usernameMin: number;
    usernameMax: number;
    passwordMin: number;
    passwordMax: number;
    displayNameMax: number;
    plansBytes: number;
    settingsBytes: number;
  };
}
