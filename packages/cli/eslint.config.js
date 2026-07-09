import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // The codebase intentionally uses `catch {}` in several places to
      // silently fall back (e.g. cache reads, config parsing).
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  }
);
