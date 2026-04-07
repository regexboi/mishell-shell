import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "electron/main.ts",
    preload: "electron/preload.ts",
  },
  format: ["cjs"],
  platform: "node",
  target: "node20",
  external: ["electron"],
  noExternal: ["zod"],
  outDir: "dist-electron",
  clean: true,
  sourcemap: true,
  splitting: false,
  loader: {
    ".sql": "text",
  },
  outExtension() {
    return {
      js: ".cjs",
    };
  },
});
