// One lint config for all three packages (WP-I). All rules are errors — agents
// ignore warnings. Never edit this file to make an error pass; fix the code.
// Inline disables are allowed only with a reason: // eslint-disable-next-line <rule> -- why
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/test-results/**", "**/node_modules/**"] },

  // Plain JS (this file) and package config files: no project service.
  js.configs.recommended,
  {
    files: ["eslint.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.config.ts"],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // Package code: type-checked. projectService maps each file to the nearest
  // tsconfig (canvas/tsconfig.json covers the root-level test/ dir).
  {
    files: [
      "shared/**/*.{ts,tsx}",
      "server/**/*.ts",
      "app/src/**/*.{ts,tsx}",
      "app/test/**/*.ts",
      "test/**/*.ts",
    ],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // WP-I additions on top of recommendedTypeChecked — the rules that catch
      // what agents actually get wrong.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/consistent-type-imports": "error",
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

  // Test code (and the frozen canvas/test/smoke.ts) handles untyped wire JSON:
  // `any` is the honest type there and the unsafe-* cascade is noise. These
  // files are also excluded from edits (WP-I: do not touch) — relax, don't fix.
  {
    files: ["**/test/**", "test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
    },
  },

  // app/src talks to Excalidraw + ext-apps through deliberately loose boundary
  // types (Host / ExAPI in CanvasApp.tsx — every `any` there is disable-marked
  // with a reason). The unsafe-* family would fire on every access through
  // those aliases; the boundary anys themselves still error via no-explicit-any.
  {
    files: ["app/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },

  // React hooks rules: app/ only.
  {
    files: ["app/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // Vendored upstream code: disable the rules that fight it via override —
  // never edit these files.
  {
    files: [
      "shared/src/normalize.ts",
      "shared/src/describe.ts",
      "shared/src/geometry.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },

  // Keep Prettier as the only formatter: last, it turns off conflicting style rules.
  prettier,
);
