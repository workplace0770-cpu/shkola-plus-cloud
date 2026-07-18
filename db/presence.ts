import type { SchoolRole } from "./accounts";

export const PRESENCE_ALLOWED_ROLES = new Set<SchoolRole>([
  "admin",
  "teacher",
  "student",
]);

export const PRESENCE_ONLINE_WINDOW_MS = 7 * 60_000;
export const PRESENCE_WRITE_THROTTLE_MS = 4 * 60_000;
