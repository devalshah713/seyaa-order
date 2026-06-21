// Employee accounts, stored as a single JSON file in Vercel Blob (the same
// private store used for photos/sizes). Passwords are never stored in plain
// text — only a scrypt hash + per-user salt. The owner is a permanent
// break-glass admin defined by environment variables, so you can never lock
// yourself out even if the accounts file is empty.
import { put, list } from "@vercel/blob";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import type { Role } from "./session";

const BLOB_PATH = "config/users.json";

export type StoredUser = {
  username: string;
  name: string;
  role: Role;
  salt: string;
  hash: string;
  createdAt: string;
};

// Safe to send to the browser (no salt/hash).
export type PublicUser = {
  username: string;
  name: string;
  role: Role;
  createdAt: string;
};

export function toPublic(u: StoredUser): PublicUser {
  return { username: u.username, name: u.name, role: u.role, createdAt: u.createdAt };
}

function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const s = salt || randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, 64).toString("hex");
  return { salt: s, hash };
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function readUsers(): Promise<StoredUser[]> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return [];
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, token, limit: 100 });
    const blob = blobs.find((b) => b.pathname === BLOB_PATH) || blobs[0];
    if (!blob) return [];
    const res = await fetch(blob.url, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as StoredUser[]) : [];
  } catch {
    return [];
  }
}

async function writeUsers(users: StoredUser[]): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Account storage is not configured (BLOB_READ_WRITE_TOKEN missing).");
  await put(BLOB_PATH, JSON.stringify(users), {
    access: "private",
    token,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// The permanent owner admin, defined by env vars. Always valid, never stored.
function getOwner(): { username: string; password: string } | null {
  const username = process.env.OWNER_USERNAME;
  const password = process.env.OWNER_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

export function isOwnerConfigured(): boolean {
  return getOwner() !== null;
}

// Returns the session data for a valid username/password, or null.
export async function authenticate(
  username: string,
  password: string
): Promise<{ username: string; name: string; role: Role } | null> {
  const owner = getOwner();
  if (owner && username.toLowerCase() === owner.username.toLowerCase()) {
    return password === owner.password
      ? { username: owner.username, name: "Owner", role: "admin" }
      : null;
  }
  const users = await readUsers();
  const u = users.find((x) => x.username.toLowerCase() === username.toLowerCase());
  if (!u) return null;
  const { hash } = hashPassword(password, u.salt);
  return safeEqualHex(hash, u.hash) ? { username: u.username, name: u.name, role: u.role } : null;
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await readUsers();
  return users.map(toPublic).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createUser(input: {
  username: string;
  name: string;
  role: Role;
  password: string;
}): Promise<PublicUser> {
  const username = input.username.trim().toLowerCase();
  if (!username) throw new Error("Username is required.");
  if (!/^[a-z0-9._-]{3,}$/.test(username)) {
    throw new Error("Username must be at least 3 characters: letters, numbers, . _ - only.");
  }
  if (!input.name.trim()) throw new Error("Full name is required.");
  if ((input.password || "").length < 6) throw new Error("Password must be at least 6 characters.");

  const owner = getOwner();
  if (owner && username === owner.username.toLowerCase()) {
    throw new Error("That username is reserved for the owner account.");
  }

  const users = await readUsers();
  if (users.some((u) => u.username.toLowerCase() === username)) {
    throw new Error("That username is already taken.");
  }
  const { salt, hash } = hashPassword(input.password);
  const user: StoredUser = {
    username,
    name: input.name.trim(),
    role: input.role === "admin" ? "admin" : "staff",
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsers(users);
  return toPublic(user);
}

export async function deleteUser(username: string): Promise<void> {
  const target = username.trim().toLowerCase();
  const users = await readUsers();
  const next = users.filter((u) => u.username.toLowerCase() !== target);
  if (next.length === users.length) throw new Error("User not found.");
  await writeUsers(next);
}

export async function setPassword(username: string, password: string): Promise<void> {
  if ((password || "").length < 6) throw new Error("Password must be at least 6 characters.");
  const target = username.trim().toLowerCase();
  const users = await readUsers();
  const u = users.find((x) => x.username.toLowerCase() === target);
  if (!u) throw new Error("User not found.");
  const { salt, hash } = hashPassword(password);
  u.salt = salt;
  u.hash = hash;
  await writeUsers(users);
}
