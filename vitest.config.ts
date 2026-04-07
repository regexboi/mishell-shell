import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: "sql-raw-loader",
      transform(code, id) {
        if (id.endsWith(".sql")) {
          return {
            code: `export default ${JSON.stringify(code)};`,
            map: null,
          };
        }

        return null;
      },
    },
  ],
  test: {
    environment: "node",
    include: ["electron/**/*.test.ts", "src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
      "@shared": path.resolve(rootDir, "src/shared"),
      "@electron": path.resolve(rootDir, "electron"),
    },
  },
});
