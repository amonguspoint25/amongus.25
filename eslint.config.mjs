import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // ponytail: `// LABEL` eyebrows are an intentional rendered HUD motif app-wide,
      // not stray code comments — the heuristic can't tell, so it's off here.
      "react/jsx-no-comment-textnodes": "off",
      // ponytail: current hits are all legit external-system syncs (matchMedia,
      // IntersectionObserver, reset-on-open). Keep visible as warnings, don't block.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
