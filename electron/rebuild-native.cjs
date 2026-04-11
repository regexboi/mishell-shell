const { spawnSync } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const packageJson = require(path.join(projectRoot, "package.json"));
const electronVersion = String(packageJson.dependencies.electron).replace(
  /^[^\d]*/,
  "",
);
const electronRebuildCli = path.join(
  path.dirname(require.resolve("@electron/rebuild")),
  "cli.js",
);

const result = spawnSync(
  process.execPath,
  [
    electronRebuildCli,
    "-v",
    electronVersion,
    "-m",
    projectRoot,
    "-w",
    "better-sqlite3,node-pty",
    "-f",
    "-s",
  ],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
