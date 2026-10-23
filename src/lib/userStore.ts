// Accounts for the app, stored beside the memo DB in the same private store
// (users/users.json). Mirrors memoStore's read-modify-write approach —
// fine for a single-office user list that changes rarely.
//
// Passwords are never stored readable: each is scrypt-hashed with its own
// random salt, and only the hash is written. There is no way back from the
// stored value to the password, including for us.
import "server-only";
import { isDbConfigured, readDoc, writeDoc } from "./db";
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Role } from "./session";
import { sanitizeModules, type ModuleKey } from "./access";

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
  // Features this account may use. Left undefined on accounts created before
  // per-feature access existed — those keep full access until an admin sets a
  // list, so adding this never locked anyone out.
  modules?: ModuleKey[];
  // Who signs this account's orders off before they go ahead. Held as the
  // manager's id, not their name, so renaming an account does not break the
  // chain. Absent means nobody: that account's orders are approved the moment
  // they are entered, which is how every account worked before this existed.
  managerId?: string;
  passwordHash: string; // scrypt$<salt-b64>$<hash-b64>
  createdAt: string;
};

// What the browser is allowed to see — never includes the hash.
export type PublicUser = Omit<User, "passwordHash">;

export function publicOf(u: User): PublicUser {
  const { passwordHash: _omit, ...rest } = u;
  return rest;
}

async function readUsers(): Promise<User[]> {
  const doc = await readDoc<{ users?: User[] }>(USERS_PATH, {});
  return doc.users || []; // empty on the first run, before anyone is set up
}

async function writeUsers(users: User[]): Promise<void> {
  await writeDoc(USERS_PATH, { users });
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
  return (await readUsers()).length;
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await readUsers();
  return users.map(publicOf);
}

export async function findByUsername(username: string): Promise<User | null> {
  const users = await readUsers();
  const wanted = username.trim().toLowerCase();
  return users.find((u) => u.username.toLowerCase() === wanted) || null;
}

export type CreateUserResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: string };

export async function createUser(
  username: string,
  password: string,
  role: Role,
  modules: unknown = []
): Promise<CreateUserResult> {
  const name = username.trim();
  if (name.length < 3) return { ok: false, error: "Username must be at least 3 characters." };
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return { ok: false, error: "Username can use letters, numbers, dot, dash and underscore only." };
  }
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const users = await readUsers();
  if (users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "That username is already taken." };
  }

  const user: User = {
    id: randomUUID(),
    username: name,
    role,
    // Admins implicitly have everything, so no list is stored for them.
    modules: role === "admin" ? undefined : sanitizeModules(modules),
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsers(users);
  return { ok: true, user: publicOf(user) };
}

// Change which features an account may use. Admins keep everything, so
// switching someone to admin clears their list.
export async function updateUserAccess(
  id: string,
  role: Role,
  modules: unknown
): Promise<{ ok: boolean; error?: string }> {
  const users = await readUsers();
  const target = users.find((u) => u.id === id);
  if (!target) return { ok: false, error: "User not found." };

  // Don't allow demoting the only admin — that would leave nobody able to
  // manage users or access.
  if (
    target.role === "admin" &&
    role !== "admin" &&
    users.filter((u) => u.role === "admin").length === 1
  ) {
    return { ok: false, error: "This is the only admin. Make someone else an admin first." };
  }

  target.role = role;
  target.modules = role === "admin" ? undefined : sanitizeModules(modules);
  await writeUsers(users);
  return { ok: true };
}

// Set, or clear, who approves this account's orders.
//
// Two things are refused rather than stored. An account cannot be its own
// manager, because its orders would then wait on itself forever. And a chain
// cannot close on itself — if Rahul already reports to Dhruval, Dhruval cannot
// be made to report to Rahul, because an approval would then have nowhere to
// land. The walk up the chain is bounded by the number of accounts, so a loop
// already in the stored data cannot hang this.
export async function setUserManager(
  id: string,
  managerId: string
): Promise<{ ok: boolean; error?: string }> {
  const users = await readUsers();
  const target = users.find((u) => u.id === id);
  if (!target) return { ok: false, error: "User not found." };

  const wanted = (managerId || "").trim();
  if (!wanted) {
    delete target.managerId;
    await writeUsers(users);
    return { ok: true };
  }

  if (wanted === id) {
    return { ok: false, error: "An account cannot approve its own orders." };
  }
  const manager = users.find((u) => u.id === wanted);
  if (!manager) return { ok: false, error: "That manager is not an account here." };

  let walk: User | undefined = manager;
  for (let steps = 0; walk && steps <= users.length; steps++) {
    if (walk.id === id) {
      return {
        ok: false,
        error: `${manager.username} already reports to ${target.username}. Two accounts cannot approve each other.`,
      };
    }
    walk = walk.managerId ? users.find((u) => u.id === walk!.managerId) : undefined;
  }

  target.managerId = wanted;
  await writeUsers(users);
  return { ok: true };
}

// The account that approves this one's orders, or null. Used on the way in
// when an order is saved, so the order carries who it is waiting for.
// The manager's role comes back with the name because the approval chain turns
// on it: a seller whose manager is the head of the firm has one approval to
// wait for, not the same person's twice.
export async function managerOf(
  id: string
): Promise<{ id: string; username: string; role: Role } | null> {
  const users = await readUsers();
  const me = users.find((u) => u.id === id);
  if (!me?.managerId || me.managerId === id) return null;
  const manager = users.find((u) => u.id === me.managerId);
  return manager
    ? { id: manager.id, username: manager.username, role: manager.role }
    : null;
}

export async function deleteUser(id: string): Promise<{ ok: boolean; error?: string }> {
  const users = await readUsers();
  const target = users.find((u) => u.id === id);
  if (!target) return { ok: false, error: "User not found." };

  // Never let the last admin be removed — that would lock everyone out of user
  // management with no way back in.
  if (target.role === "admin" && users.filter((u) => u.role === "admin").length === 1) {
    return { ok: false, error: "This is the only admin. Create another admin before deleting this one." };
  }

  await writeUsers(users.filter((u) => u.id !== id));
  return { ok: true };
}
