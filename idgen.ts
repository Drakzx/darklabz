import { randomBytes } from "crypto";

export function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(3).toString("hex")}`;
}
