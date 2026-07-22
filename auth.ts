import type { Request } from "express";

export const OWNER_USERNAME = "Drakzx";
export const OWNER_PASSWORD = "Owner1!!";
// Fixed shared secret — same as original server.js.
// Change this string for extra security.
export const OWNER_SECRET = "drakzx-owner-secret-2026";

export function getToken(req: Request): string | null {
  const h = req.headers["authorization"] || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

export function isOwnerReq(req: Request): boolean {
  return getToken(req) === OWNER_SECRET;
}
