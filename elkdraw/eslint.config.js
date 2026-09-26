// Never edit this file to make an error pass; fix the code.
//
// One lint config for every elkdraw package. All rules are errors (agents
// ignore warnings). Inline disables need a reason:
//   // eslint-disable-next-line <rule> -- why
import js from "@eslint/js";
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Package dir -> the @elkdraw/* packages it may import. Keep in sync with each
// package.json and tsconfig references. Missing = may import anything.
const allowedDeps = {
  core: [],
  "backends/excalidraw": ["core"],
  "backends/fake": ["core"],
  sidecar: ["core"],
  "adapters/mcp": ["core"],
  "adapters/cli": ["core", "server"],
  "adapters/server": ["core", "backend-excalidraw", "backend-fake", "mcp"],
  app: ["core"],
};

// Packages reach each other only by @elkdraw/* name, never by relative path
// or deep import.
const seamPatterns = [
  {
    regex:
      "^(\\.\\./)+((backends|adapters|test)/)?(core|excalidraw|fake|sidecar|mcp|server|cli|app|parity|eval)/src(/|$)",
    message: "Cross-package relative import. Import the package by name.",
  },
  {
    regex: "^@elkdraw/[^/]+/",
    message: "Deep import into a package. Use its public entry point.",
  },
];

const restrictImports = (patterns) => ({
  "no-restricted-imports": ["error", { patterns }],
});

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/test-results/**"],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },

  js.configs.recommended,
  comments.recommended,
  {
    rules: {
      "@eslint-community/eslint-comments/require-description": "error",
      "@eslint-community/eslint-comments/no-unlimited-disable": "error",
      eqeqeq: ["error", "always"],
      "no-console": "error",
      "no-restricted-properties": [
        "error",
        {
          object: "JSON",
          property: "parse",
          message:
            "Use parseJson/safeParseJson from @elkdraw/core (validates with a zod schema).",
        },
      ],
      ...restrictImports(seamPatterns),
    },
  },

  // Plain JS config files: no type information.
  {
    files: ["**/*.js"],
    languageOptions: { globals: globals.node },
  },

  // All TypeScript: fully type-checked.
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: false },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Dependency direction. Rule options replace (not merge), so each block
  // restates the seam patterns.
  ...Object.entries(allowedDeps).map(([dir, allowed]) => ({
    files: [`${dir}/**`],
    rules: restrictImports([
      ...seamPatterns,
      {
        group: ["@elkdraw/*", ...allowed.map((name) => `!@elkdraw/${name}`)],
        message: `${dir} may import only: ${allowed.length ? allowed.map((n) => `@elkdraw/${n}`).join(", ") : "no @elkdraw packages"}.`,
      },
    ]),
  })),

  // The one place JSON.parse is allowed.
  {
    files: ["core/src/json.ts"],
    rules: { "no-restricted-properties": "off" },
  },

  // Console output is the product in the CLI and eval harness.
  {
    files: ["adapters/cli/**", "eval/**", "scripts/**"],
    rules: { "no-console": "off" },
  },

  // React hooks + React Compiler rules, all promoted to error.
  {
    files: ["app/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: Object.fromEntries(
      Object.keys(reactHooks.configs.flat["recommended-latest"].rules).map(
        (rule) => [rule, "error"],
      ),
    ),
    languageOptions: { globals: globals.browser },
  },

  // Prettier is the only formatter: last, it turns off conflicting style rules.
  prettier,
);
