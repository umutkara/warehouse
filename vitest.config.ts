import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "app/api/units/move/route.ts",
        "app/api/logistics/ship-out/route.ts",
      ],
      thresholds: {
        lines: 20,
        functions: 20,
        branches: 10,
        statements: 20,
      },
    },
  },
});
