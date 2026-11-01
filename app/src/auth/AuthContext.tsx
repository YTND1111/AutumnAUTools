import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { BACKEND_ENABLED } from "../config";
import { ApiError } from "../services/api";
import { loginRequest, logoutRequest, meRequest, metaRequest, registerRequest } from "./api";
import { clearSession, getCachedUser, getToken, setSession } from "./tokenStore";
import type { AuthUser, BackendMeta } from "./types";

/**
 * 登录态上下文（与 settings / plans 的 Provider 抽象同构，但状态源是后端会话）。
 *
 * - 挂载时：有本地 token 就先用缓存的用户资料渲染（避免闪一下未登录），
 *   再请求 /api/auth/me 校正；仅当后端明确返回 401 才登出，网络故障（status=0）
 *   保留登录态，离线也能继续用本机镜像；
 * - login / register：成功后写入 token 与用户资料，Settings/Plans 上下文会因
 *   user.id 变化自动重新加载该用户的云端数据；
 * - logout：无论后端是否可达都清掉本地凭据（保证能退出）。
 */

export interface AuthContextValue {
  /** 是否启用云端后端（构建期开关 BACKEND_ENABLED） */
  enabled: boolean;
  /** 当前登录用户；null = 未登录（纯本地模式） */
  user: AuthUser | null;
  /** 首次校验完成 */
  ready: boolean;
  /** 请求进行中 */
  busy: boolean;
  /** 最近一次错误文案（供表单展示） */
  error: string;
  /** 后端公开配置（是否开放注册、字段长度约束等） */
  meta: BackendMeta | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string, email?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  /** 重新拉取当前用户信息 */
  refresh: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  enabled: BACKEND_ENABLED,
  user: null,
  ready: false,
  busy: false,
  error: "",
  meta: null,
  login: async () => false,
  register: async () => false,
  logout: async () => {},
  refresh: async () => {},
  clearError: () => {},
});

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "操作失败，请稍后重试。";
}

export function AuthContextProvider({ children }: { children: ReactNode }) {
  // 首帧即用缓存的用户资料渲染登录态：避免已登录用户先闪一下未登录，
  // 也避免设置/方案上下文先按「匿名作用域」白加载一次本机数据
  const [user, setUser] = useState<AuthUser | null>(() =>
    BACKEND_ENABLED && getToken() ? getCachedUser() : null,
  );
  const [ready, setReady] = useState(!BACKEND_ENABLED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<BackendMeta | null>(null);

  // 挂载：校验既有登录态 + 拉取后端公开配置
  useEffect(() => {
    if (!BACKEND_ENABLED) return;
    let cancelled = false;

    metaRequest()
      .then((value) => {
        if (!cancelled) setMeta(value);
      })
      .catch(() => {
        /* 元信息失败不影响使用（注册开关默认按开放处理） */
      });

    const token = getToken();
    if (!token) {
      setReady(true);
      return;
    }

    setUser(getCachedUser());
    meRequest()
      .then((res) => {
        if (cancelled) return;
        setUser(res.user);
        setSession(token, res.user);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          setUser(null);
        }
        // 网络故障：保留缓存的登录态，继续用本机镜像
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await loginRequest(username.trim(), password);
      setSession(res.token, res.user);
      setUser(res.user);
      return true;
    } catch (err) {
      setError(messageOf(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const register = useCallback(async (username: string, password: string, email?: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await registerRequest(username.trim(), password, email?.trim() || undefined);
      setSession(res.token, res.user);
      setUser(res.user);
      return true;
    } catch (err) {
      setError(messageOf(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await logoutRequest();
    } catch (err) {
      // 服务不可达也要能退出：只记日志，本地凭据照常清除
      console.warn("[账号] 注销请求失败，仍在本地退出登录。", err);
    } finally {
      clearSession();
      setUser(null);
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await meRequest();
      setUser(res.user);
      const token = getToken();
      if (token) setSession(token, res.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        setUser(null);
      }
    }
  }, []);

  const clearError = useCallback(() => setError(""), []);

  return (
    <AuthContext.Provider
      value={{
        enabled: BACKEND_ENABLED,
        user,
        ready,
        busy,
        error,
        meta,
        login,
        register,
        logout,
        refresh,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
