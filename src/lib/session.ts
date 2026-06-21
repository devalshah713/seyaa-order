// Stateless signed-cookie sessions. Implemented with the Web Crypto API
// (crypto.subtle) so the exact same code works in both the Edge middleware
// and Node.js route handlers / server components. The cookie holds a small
// signed payload (who you are + when it expires); it is verified on every
// request, so we never have to store sessions on the server.
export const SESSION_COOKIE = "seyaa_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export type Role = "admin" | "staff";
export type SessionData = { username: string; name: string; role: Role };

const encoder = new TextEncoder();

// Secret used to sign cookies. A dedicated SESSION_SECRET is preferred, but we
// fall back to the always-present BLOB token so login works without extra setup.
function getSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.BLOB_READ_WRITE_TOKEN ||
    "seyaa-insecure-dev-secret"
  );
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(data: SessionData): Promise<string> {
  const payload = { ...data, exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64) as BufferSource);
  return `${payloadB64}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionData | null> {
  if (!token) return null;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;
  try {
    const key = await getKey();
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sigB64) as BufferSource,
      encoder.encode(payloadB64) as BufferSource
    );
    if (!ok) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlDecode(payloadB64))
    );
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (!payload.username || (payload.role !== "admin" && payload.role !== "staff")) {
      return null;
    }
    return { username: payload.username, name: payload.name || payload.username, role: payload.role };
  } catch {
    return null;
  }
}
