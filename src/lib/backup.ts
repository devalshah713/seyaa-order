import "server-only";
import type { NextRequest } from "next/server";

// Guards the backup endpoints. Mirrors the isDriveConfigured() convention:
// no BACKUP_TOKEN set → feature unconfigured (501); wrong/missing token on a
// request → unauthorized (401).
export function isBackupConfigured(): boolean {
  return !!process.env.BACKUP_TOKEN;
}

// Accepts the secret via the `x-backup-token` header or a `?token=` query param.
export function tokenOk(req: NextRequest): boolean {
  const expected = process.env.BACKUP_TOKEN;
  if (!expected) return false;
  const provided =
    req.headers.get("x-backup-token") || req.nextUrl.searchParams.get("token") || "";
  // Constant-time-ish comparison (lengths differ → fail fast).
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
