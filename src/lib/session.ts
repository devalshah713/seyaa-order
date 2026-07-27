// Signed session cookie: base64url(payload).base64url(HMAC-SHA256).
//
// Deliberately free of Node APIs — middleware.ts runs on the Edge runtime and
// has to verify this on every request, so everything here uses Web Crypto only.
// Password hashing needs node:crypto and lives in userStore.ts instead.

export type Role = "admin" | "user";

export type Session = {
  uid: string;
  username: string;
  role: Role;
  exp: number; // unix seconds
};

export const SESSION_COOKIE = "seyaa_session";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodePayload(s: Session): string {
  return b64urlFromBytes(new TextEncoder().encode(JSON.stringify(s)));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64urlFromBytes(new Uint8Array(sig));
}

export function sessionSecret(): string | null {
  return process.env.AUTH_SECRET || null;
}

export async function signSession(
  session: Omit<Session, "exp">,
  secret: string
): Promise<string> {
  const full: Session = { ...session, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
  const payload = encodePayload(full);
  return `${payload}.${await hmac(secret, payload)}`;
}

// Returns null for anything that isn't a currently-valid, correctly-signed
// token. Signature is compared in constant time so a wrong cookie can't be
// tuned byte-by-byte into a right one.
export async function verifySession(token: string | undefined, secret: string): Promise<Session | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = await hmac(secret, payload);
  if (provided.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  try {
    const s = JSON.parse(new TextDecoder().decode(bytesFromB64url(payload))) as Session;
    if (!s || typeof s.exp !== "number" || s.exp < Math.floor(Date.now() / 1000)) return null;
    if (s.role !== "admin" && s.role !== "user") return null;
    return s;
  } catch {
    return null;
  }
}
