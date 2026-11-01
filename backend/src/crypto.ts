/**
 * 密码哈希与会话 token —— 全部基于 Web Crypto（Workers 与浏览器/Node 均原生支持），
 * 不引入任何第三方加密库。
 *
 * 密码存储格式（自描述，便于日后平滑升级迭代次数或算法）：
 *   pbkdf2-sha256$<iterations>$<salt-b64url>$<hash-b64url>
 *
 * 「胡椒」（AUTH_PEPPER）说明：
 *   设置后，PBKDF2 的输入不是明文口令本身，而是 HMAC-SHA256(pepper, password)。
 *   这样即使 D1 数据库整体泄露，攻击者没有 pepper 也无法离线爆破。
 *   ⚠️ pepper 一旦变更，所有既有密码都会校验失败，务必妥善保存。
 */

const PREFIX = "pbkdf2-sha256";
const SALT_BYTES = 16;
const KEY_BITS = 256;

const encoder = new TextEncoder();

/** Uint8Array → base64url（无填充） */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url → Uint8Array */
export function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** SHA-256 十六进制摘要（会话 token 只以该摘要入库） */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** 生成高强度随机 token（32 字节 → 43 字符 base64url） */
export function createSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** 生成 uuid v4（用户主键） */
export function createUserId(): string {
  return crypto.randomUUID();
}

/** 计算 PBKDF2 的输入材料：有 pepper 时先做 HMAC，避免明文口令直接进 KDF */
/**
 * Web Crypto 的 BufferSource 在 DOM 类型里要求「ArrayBuffer 视图」，
 * 而 Uint8Array 的默认泛型参数是 ArrayBufferLike，这里统一显式转换一次。
 */
function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

async function passwordMaterial(password: string, pepper: string): Promise<Uint8Array> {
  if (!pepper) return encoder.encode(password);
  const key = await crypto.subtle.importKey(
    "raw",
    asBufferSource(encoder.encode(pepper)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, asBufferSource(encoder.encode(password)));
  return new Uint8Array(signature);
}

async function derive(password: string, pepper: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await passwordMaterial(password, pepper);
  const baseKey = await crypto.subtle.importKey("raw", asBufferSource(material), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: asBufferSource(salt), iterations },
    baseKey,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** 生成密码哈希字符串（注册与改密时调用） */
export async function hashPassword(password: string, pepper: string, iterations: number): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await derive(password, pepper, salt, iterations);
  return `${PREFIX}$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/** 定长常量时间比较（避免通过响应时间侧信道推测哈希） */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

/**
 * 校验密码。
 * 返回 { ok, needsRehash }：当存储时的迭代次数低于当前配置时 needsRehash=true，
 * 登录成功后可用新参数重算一遍（密码算法平滑升级）。
 */
export async function verifyPassword(
  password: string,
  stored: string,
  pepper: string,
  currentIterations: number,
): Promise<{ ok: boolean; needsRehash: boolean }> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false, needsRehash: false };
  const iterations = Number.parseInt(parts[1] ?? "", 10);
  const saltPart = parts[2] ?? "";
  const hashPart = parts[3] ?? "";
  if (!Number.isFinite(iterations) || iterations <= 0 || !saltPart || !hashPart) {
    return { ok: false, needsRehash: false };
  }

  let expected: Uint8Array;
  try {
    expected = fromBase64Url(hashPart);
  } catch {
    return { ok: false, needsRehash: false };
  }

  const actual = await derive(password, pepper, fromBase64Url(saltPart), iterations);
  const ok = timingSafeEqual(actual, expected);
  return { ok, needsRehash: ok && iterations < currentIterations };
}
