import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // These three suites use the `node:test` runner (see the `test:unit` npm
    // script) and are NOT vitest specs — vitest cannot bundle `node:test`.
    // Excluded here so the widened `.ts` include (added for the push helpers)
    // doesn't pull them into the vitest run.
    exclude: [
      "**/node_modules/**",
      "src/utils/splitMath.test.ts",
      "src/utils/groupTransactions.test.ts",
      "src/components/transactions/form/calculator/calculatorMath.test.ts",
    ],
  },
});
