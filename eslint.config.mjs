import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The app's established pattern is fetch-on-mount in comment sections;
      // keep the signal as a warning rather than an error.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([".next/**", "node_modules/**"]),
]);
