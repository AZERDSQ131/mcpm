import { describe, it, expect } from "vitest";
import { isSecretEnvVar, maskSecretValue, formatEnvValue } from "./secrets.js";

describe("isSecretEnvVar", () => {
  it("treats an env var as secret by default (no secret field)", () => {
    expect(isSecretEnvVar({})).toBe(true);
  });

  it("treats an env var as secret when secret is explicitly true", () => {
    expect(isSecretEnvVar({ secret: true })).toBe(true);
  });

  it("treats an env var as non-secret only when secret is explicitly false", () => {
    expect(isSecretEnvVar({ secret: false })).toBe(false);
  });
});

describe("maskSecretValue", () => {
  it("returns an empty string for an empty value", () => {
    expect(maskSecretValue("")).toBe("");
  });

  it("fully masks values of 4 characters or fewer", () => {
    expect(maskSecretValue("abcd")).toBe("****");
    expect(maskSecretValue("a")).toBe("*");
  });

  it("keeps the first two and last two characters visible for longer values", () => {
    const masked = maskSecretValue("ghp_1234567890abcdef");
    expect(masked.startsWith("gh")).toBe(true);
    expect(masked.endsWith("ef")).toBe(true);
  });

  it("never includes the original middle characters in the output", () => {
    const value = "sk-supersecrettoken12345";
    const masked = maskSecretValue(value);
    expect(masked).not.toContain("supersecrettoken");
  });

  it("caps the masked portion length so very long secrets don't produce huge output", () => {
    const value = "x".repeat(200);
    const masked = maskSecretValue(value);
    expect(masked.length).toBeLessThan(20);
  });

  it("is deterministic for the same input", () => {
    expect(maskSecretValue("abcdefgh")).toBe(maskSecretValue("abcdefgh"));
  });
});

describe("formatEnvValue", () => {
  it("masks the value when the env var is a secret", () => {
    const formatted = formatEnvValue("ghp_abcdefghij", { secret: true });
    expect(formatted).not.toBe("ghp_abcdefghij");
    expect(formatted).not.toContain("abcdefghij");
  });

  it("masks the value by default when secret is unspecified", () => {
    const formatted = formatEnvValue("ghp_abcdefghij", {});
    expect(formatted).not.toBe("ghp_abcdefghij");
  });

  it("returns the value unmasked when secret is explicitly false", () => {
    const formatted = formatEnvValue("us-east-1", { secret: false });
    expect(formatted).toBe("us-east-1");
  });
});
