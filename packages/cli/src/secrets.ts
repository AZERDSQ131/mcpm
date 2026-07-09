import type { EnvVar } from "./types.js";

/** An env var is treated as a secret unless the registry explicitly marks it `secret: false`. */
export function isSecretEnvVar(meta: Pick<EnvVar, "secret">): boolean {
  return meta.secret !== false;
}

/**
 * Masks a secret value for display, keeping a couple of characters on each end so it's
 * recognizable without exposing the full value (e.g. `ghp_***********cdEf`).
 */
export function maskSecretValue(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "*".repeat(value.length);

  const visibleStart = value.slice(0, 2);
  const visibleEnd = value.slice(-2);
  const maskedLength = Math.min(10, value.length - 4);
  return `${visibleStart}${"*".repeat(maskedLength)}${visibleEnd}`;
}

/** Formats an env var value for display, masking it if it's a secret. */
export function formatEnvValue(value: string, meta: Pick<EnvVar, "secret">): string {
  return isSecretEnvVar(meta) ? maskSecretValue(value) : value;
}
