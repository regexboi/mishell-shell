import { describe, expect, it } from "vitest";

// @ts-expect-error The sync script is an executable ESM module without a typed TS entrypoint.
import { extractStaticSpecFromSource } from "./sync-completion-specs.mjs";

describe("extractStaticSpecFromSource", () => {
  it("drops script generators that rely on postProcess", () => {
    const spec = extractStaticSpecFromSource(`
      export default {
        args: {
          generators: {
            postProcess: (stdout) => stdout.split("\\n").map((name) => ({ name })),
            script: ["pnpm", "run"],
          },
        },
        name: "pnpm",
      };
    `);

    expect(spec).toEqual({
      name: "pnpm",
    });
  });

  it("keeps script generators that can be represented statically", () => {
    const spec = extractStaticSpecFromSource(`
      export default {
        args: {
          generators: {
            script: ["git", "branch", "--format=%(refname:short)"],
          },
        },
        name: "git",
      };
    `);

    expect(spec).toEqual({
      args: {
        generators: {
          script: ["git", "branch", "--format=%(refname:short)"],
        },
      },
      name: "git",
    });
  });

  it("resolves default exports produced by local factory calls", () => {
    const spec = extractStaticSpecFromSource(`
      const createSpec = (includeBuild = true) => ({
        name: "cargo",
        subcommands: includeBuild ? [{ name: "build" }] : [],
      });

      const spec = createSpec();

      export { spec as default };
    `);

    expect(spec).toEqual({
      name: "cargo",
      subcommands: [
        {
          name: "build",
        },
      ],
    });
  });
});
