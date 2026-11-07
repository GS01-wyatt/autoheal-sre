/**
 * The ONLY things the recovery worker may ever touch.
 * API requests can only pick a key from this list; they can never supply a command.
 */
export const ALLOWED_TARGETS = ["demo-app"] as const;
export type AllowedTarget = (typeof ALLOWED_TARGETS)[number];

export const isAllowedTarget = (v: unknown): v is AllowedTarget =>
  typeof v === "string" && (ALLOWED_TARGETS as readonly string[]).includes(v);