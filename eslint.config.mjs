import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import authlab from "./eslint-rules/no-unguarded-outbound.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // SSRF guard enforcement: server code must use guardedFetch() for
    // outbound HTTP. See eslint-rules/no-unguarded-outbound.mjs.
    files: ["src/**/*.{ts,tsx,js,jsx,mjs}"],
    plugins: { authlab },
    rules: {
      "authlab/no-unguarded-outbound": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".claude/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "docs/**",
  ]),
]);

export default eslintConfig;
