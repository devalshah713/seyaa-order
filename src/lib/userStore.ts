// Accounts for the app, stored beside the memo DB in the same private Blob
// store (users/users.json). Mirrors memoStore's read-modify-write approach —
// fine for a single-office user list that changes rarely.
//
// Passwords are never stored readable: each is scrypt-hashed with its own
// random salt, and only the hash is written. There is no way back from the
// stored value to the password, including for us.
import "server-only";
import { get, put, BlobNotFoundError } from "@vercel/blob";
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Role } from "./session";

const USERS_PATH = "users/users.json";
const SCRYPT_KEYLEN = 64;

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

export type User = {
  id: string;
  username: string;
  role: Role;
  passwordHash: string; // scrypt$<salt-b64>$<hash-b64>
  createdAt: string;
};

// What the browser is allowed to see — never includes the hash.
export type PublicUser = Omit<User, "passwordHash">;

export function publicOf(u: User): PublicUser {
  const { passwordHash: _omit, ...rest } = u;
  return rest;
}

function requireToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "User storage is not configured. Add the BLOB_READ_WRITE_TOKEN environment variable in Vercel and redeploy."
    );
  }
  return token;
}

async function readUsers(token: string): Promise<User[]> {
  try {
    const result = await get(USERS_PATH, { access: "private", token, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return [];
    const parsed = (await new Response(result.stream).json()) as { users?: User[] };
    return parsed.users || [];
  } catch (err) {
    if (err instanceof BlobNotFoundError) return []; // first run
    throw err;
  }
}

async function writeUsers(users: User[], token: string): Promise<void> {
  await put(USERS_PATH, JSON.stringify({ users }), {
    access: "private",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function countUsers(): Promise<number> {
  return (await readUsers(requireToken())).length;
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await readUsers(requireToken());
  return users.map(publicOf);
}

export async function findByUsername(username: string): Promise<User | null> {
  const users = await readUsers(requireToken());
  const wanted = username.trim().toLowerCase();
  return users.find((u) => u.username.toLowerCase() === wanted) || null;
}

export type CreateUserResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: string };

export async function createUser(
  username: string,
  password: string,
  role: Role
): Promise<CreateUserResult> {
  const name = username.trim();
  if (name.length < 3) return { ok: false, error: "Username must be at least 3 characters." };
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return { ok: false, error: "Username can use letters, numbers, dot, dash and underscore only." };
  }
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const token = requireToken();
  const users = await readUsers(token);
  if (users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "That username is already taken." };
  }

  const user: User = {
    id: randomUUID(),
    username: name,
    role,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsers(users, token);
  return { ok: true, user: publicOf(user) };
}

export async function deleteUser(id: string): Promise<{ ok: boolean; error?: string }> {
  const token = requireToken();
  const users = await readUsers(token);
  const target = users.find((u) => u.id === id);
  if (!target) return { ok: false, error: "User not found." };

  // Never let the last admin be removed — that would lock everyone out of user
  // management with no way back in.
  if (target.role === "admin" && users.filter((u) => u.role === "admin").length === 1) {
    return { ok: false, error: "This is the only admin. Create another admin before deleting this one." };
  }

  await writeUsers(users.filter((u) => u.id !== id), token);
  return { ok: true };
}
