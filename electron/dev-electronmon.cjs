const fs = require("node:fs");
const path = require("node:path");

const projectRoot = fs.realpathSync(path.resolve(__dirname, ".."));
const electronmon = require("electronmon");

electronmon({
  cwd: projectRoot,
  args: [path.join(projectRoot, "dist-electron", "main.cjs")],
  electronPath: path.join(projectRoot, "electron", "launch-electron-dev.sh"),
  logLevel: process.env.ELECTRONMON_LOGLEVEL || "info",
});
