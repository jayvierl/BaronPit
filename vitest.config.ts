import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "server-only": "next/dist/compiled/server-only/empty.js", "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts","src/**/*.test.tsx","test/**/*.test.mjs"] },
});
