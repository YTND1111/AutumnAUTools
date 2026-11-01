import type { AppConfig } from "./config.ts";
import type { Env, ExecutionContext } from "./types.ts";

/**
 * 极简路由器（零依赖）。
 *
 * 仅支持静态段与 `:param` 段，足够本项目的 REST 端点使用；
 * 未匹配到路径 → 交给 index.ts 返回 404 / 405。
 */

export interface RouteContext {
  request: Request;
  env: Env;
  cfg: AppConfig;
  ctx: ExecutionContext;
  url: URL;
  params: Record<string, string>;
}

export type RouteHandler = (c: RouteContext) => Promise<Response> | Response;

export interface Route {
  /** HTTP 方法，大写 */
  method: string;
  /** 路径模式，如 "/api/auth/login"、"/api/plans/:id" */
  pattern: string;
  handler: RouteHandler;
}

export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function splitPath(path: string): string[] {
  return normalizePath(path)
    .split("/")
    .filter((segment) => segment.length > 0);
}

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = splitPath(pattern);
  const pathParts = splitPath(pathname);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const patternPart = patternParts[i] as string;
    const pathPart = pathParts[i] as string;
    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      continue;
    }
    if (patternPart !== pathPart) return null;
  }
  return params;
}

/** 按方法 + 路径查找路由 */
export function matchRoute(routes: Route[], method: string, pathname: string): RouteMatch | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchPattern(route.pattern, pathname);
    if (params) return { route, params };
  }
  return null;
}

/** 路径能匹配但方法不对时，返回允许的方法列表（用于 405 与 Allow 头） */
export function allowedMethods(routes: Route[], pathname: string): string[] {
  const methods = new Set<string>();
  for (const route of routes) {
    if (matchPattern(route.pattern, pathname)) methods.add(route.method);
  }
  methods.add("OPTIONS");
  return Array.from(methods).sort();
}
