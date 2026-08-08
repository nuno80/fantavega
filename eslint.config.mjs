import { createRequire } from "module";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier";

// eslint-config-next (15.x) è una config legacy (eslintrc), non flat config.
// FlatCompat (dipendenza di eslint, montata nella store pnpm sotto
// @eslint+eslintrc) la converte nel formato flat di ESLint 9.
const require = createRequire(import.meta.url);
const { FlatCompat } = require("@eslint/eslintrc");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

const compat = new FlatCompat({
  baseDirectory: process.cwd(),
});

export default defineConfig([
  ...compat.extends("next/core-web-vitals"),
  prettier,
  {
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "prefer-arrow-callback": "error",
      "prefer-template": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "coverage/**",
    "guide/**",
    "database/backups/**",
  ]),
]);
